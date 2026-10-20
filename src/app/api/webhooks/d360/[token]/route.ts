import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { superAdminDb, withTenant } from "@/lib/db";
import { checkIpRateLimit, checkTenantRateLimit, clientIp } from "@/lib/rateLimit";
import { parseMetaWebhookPayload, applyParsedMetaWebhook } from "@/lib/integrations/meta/webhookHandler";
import { runChatbotEngine } from "@/lib/chatbot/engine";
import { decryptSecret } from "@/lib/crypto";
import { downloadD360Media } from "@/lib/integrations/d360/client";
import { transcribeVoiceMessage } from "@/lib/ai/transcribeVoiceMessage";
import { getTenantChatbotLimits } from "@/lib/planLimits";

/**
 * webhook رسائل قناة 360dialog (رسائل واردة + حالات التسليم + حالة القوالب) — 360dialog يمرّر حمولة
 * Meta Cloud API كما هي، فتُعالَج بنفس محلل وتطبيق webhook Meta حرفياً. القناة تُعرَف من رمز سري
 * فريد في الرابط (يُضبط لكل قناة عند ربطها، ويُخزَّن مُجزَّأً SHA-256) — لا يُقبل أي رابط آخر.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req.headers);
  if (!(await checkIpRateLimit(ip, "webhook-d360", 1200, 60)).allowed) return new NextResponse("Rate limit exceeded", { status: 429 });

  const { token } = await props.params;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const integration = await superAdminDb.integration.findUnique({ where: { webhookTokenHash: tokenHash } });
  if (!integration || integration.provider !== "D360DIALOG") return new NextResponse("Not found", { status: 404 });

  const tenantId = integration.tenantId;
  if (!(await checkTenantRateLimit(tenantId, "webhook-d360-tenant", 600, 60)).allowed) return new NextResponse("Rate limit exceeded", { status: 429 });

  const payload = await req.json().catch(() => null);
  if (!payload) return new NextResponse("Invalid JSON", { status: 400 });
  const parsed = parseMetaWebhookPayload(payload);
  // الرسائل الصوتية ⇒ نص (Whisper) قبل التخزين، فيفهمها الشات بوت والموظف الذكي — نفس سلوك قناة Meta.
  // أي فشل (تنزيل/تفريغ) يترك الرسالة كما وصلت؛ لا تُفقد رسالة أبداً.
  if (!integration.isSandbox && integration.encryptedAccessToken) {
    const audio = parsed.messages.filter((m) => m.type === "AUDIO" && m.metaMediaId);
    if (audio.length > 0 && (await getTenantChatbotLimits(tenantId)).voiceMessagesEnabled) {
      const apiKey = decryptSecret(integration.encryptedAccessToken);
      for (const msg of audio) {
        const media = await downloadD360Media(msg.metaMediaId!, apiKey);
        if (!media) continue;
        const transcript = await transcribeVoiceMessage(media.buffer, media.mimeType);
        if (transcript) msg.body = transcript;
      }
    }
  }

  const affectedConversationIds = await applyParsedMetaWebhook(tenantId, parsed);

  // محرك الشات بوت بعد التزام المعاملة (نفس ترتيب webhook Meta) — قد يرسل رداً عبر نفس القناة.
  for (const conversationId of affectedConversationIds) {
    await runChatbotEngine(tenantId, conversationId).catch((err) =>
      console.error(`❌ فشل تشغيل محرك الشات بوت للمحادثة ${conversationId}:`, err instanceof Error ? err.message : err)
    );
  }

  await withTenant(tenantId, (tx) =>
    tx.webhookLog.create({
      data: {
        tenantId, provider: "D360DIALOG",
        eventType: parsed.messages.length > 0 ? "message" : parsed.statuses.length > 0 ? "status_update" : parsed.templateStatusUpdates.length > 0 ? "template_status" : "other",
        payloadJson: payload as Prisma.InputJsonValue, signatureValid: true, processedAt: new Date(),
      },
    })
  );
  return NextResponse.json({ ok: true });
}
