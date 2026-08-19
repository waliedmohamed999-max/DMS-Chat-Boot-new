import { NextRequest, NextResponse } from "next/server";
import { metaAdapter } from "@/lib/integrations/meta/adapter";
import { superAdminDb, withTenant } from "@/lib/db";
import { checkTenantRateLimit, checkIpRateLimit } from "@/lib/rateLimit";
import { timingSafeStringEqual } from "@/lib/crypto";
import { parseMetaWebhookPayload, applyParsedMetaWebhook } from "@/lib/integrations/meta/webhookHandler";
import { runChatbotEngine } from "@/lib/chatbot/engine";

// Meta يستدعي GET أثناء إعداد الـ webhook للتحقق (hub.challenge)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token && expectedToken && timingSafeStringEqual(token, expectedToken)) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  // حد بعنوان IP قبل أي تحقّق توقيع أو كتابة قاعدة بيانات — يمنع طرفاً مجهولاً من إغراق WebhookLog
  // بطلبات توقيعها خاطئ عمداً (راجع تعليق checkIpRateLimit في lib/rateLimit.ts).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "webhook-meta-unauth", 120, 60);
  if (!ipLimit.allowed) return new NextResponse("Rate limit exceeded", { status: 429 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const signatureValid = await metaAdapter.verifyWebhookSignature(rawBody, signature);

  if (!signatureValid) {
    await superAdminDb.webhookLog.create({
      data: {
        provider: "META_WHATSAPP", eventType: "unknown", payloadJson: safeParse(rawBody),
        signatureValid: false, errorMessage: "Invalid signature",
      },
    });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = safeParse(rawBody);
  const parsed = parseMetaWebhookPayload(payload);

  const integration = parsed.phoneNumberId
    ? await superAdminDb.integration.findFirst({ where: { provider: "META_WHATSAPP", externalAccountId: parsed.phoneNumberId } })
    : null;

  if (!integration) {
    await superAdminDb.webhookLog.create({
      data: {
        provider: "META_WHATSAPP", eventType: "unmatched_account", payloadJson: payload,
        signatureValid: true, errorMessage: "لم يتم إيجاد تكامل مطابق لـ phone_number_id",
      },
    });
    return NextResponse.json({ ok: true });
  }

  // حد استقبال لكل مستأجر: يمنع تدفق webhooks ضخم أو مسيء من تاجر واحد على مسار معالجة مشترك
  const rateLimit = await checkTenantRateLimit(integration.tenantId, "webhook-meta", 300, 60);
  if (!rateLimit.allowed) {
    return new NextResponse("Rate limit exceeded", { status: 429 });
  }

  const affectedConversationIds = await applyParsedMetaWebhook(integration.tenantId, parsed);

  // محرك الشات بوت الحقيقي يُشغَّل بعد التزام معاملة applyParsedMetaWebhook (وليس داخلها) — قد يتضمن
  // اتصالاً شبكياً فعلياً (إرسال رد واتساب، استدعاء API خارجي)، فمن الأنسب ألا يبقي أي transaction مفتوحة.
  for (const conversationId of affectedConversationIds) {
    await runChatbotEngine(integration.tenantId, conversationId).catch((err) =>
      console.error(`❌ فشل تشغيل محرك الشات بوت للمحادثة ${conversationId}:`, err instanceof Error ? err.message : err)
    );
  }

  // WebhookLog جدول مستأجر خاضع لـ RLS — يجب المرور عبر withTenant() وإلا يُرفض الإدخال بصمت
  // (نفس فئة الخطأ المكتشفة مراراً في جولات سابقة عند الكتابة المباشرة عبر rawDb/superAdminDb
  // لجدول مستأجر بدل withTenant()).
  await withTenant(integration.tenantId, (tx) =>
    tx.webhookLog.create({
      data: {
        tenantId: integration.tenantId, provider: "META_WHATSAPP",
        eventType: parsed.messages.length > 0 ? "message" : parsed.statuses.length > 0 ? "status_update" : "other",
        payloadJson: payload, signatureValid: true, processedAt: new Date(),
      },
    })
  );

  return NextResponse.json({ ok: true });
}

function safeParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}
