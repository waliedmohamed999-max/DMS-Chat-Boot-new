import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { checkIpRateLimit, checkTenantRateLimit } from "@/lib/rateLimit";
import { mintRealtimeClientSecret } from "@/lib/ai/openaiClient";
import { buildTenantVoiceCallInstructions, getOrCreateAiAgentConfig } from "@/lib/ai/aiAgentConfig";
import { parseChatbotLimits, isUnlimited } from "@/lib/planLimits";

// نفس النصّ الحرفي المُستخدَم في [sessionId]/voice-transcript/route.ts لتتبّع بداية المكالمة.
const CALL_START_MARKER = "[بدأت مكالمة صوتية]";

/**
 * يصدر توكن Realtime API مؤقتاً لبدء مكالمة صوتية حية لويدجت موقع تاجر — نظير
 * /api/platform-chat/realtime-token، لكن بترتيب فحص مختلف مقصود: بوابة الباقة/التفعيل أولاً (فحص
 * رخيص، DB فقط)، ثم حصة الدقائق الشهرية (DB أيضاً)، ثم حدود المعدّل أخيراً — حتى لا نستهلك عداد
 * المعدّل المحدود لمكالمات مرفوضة أصلاً ببوابة الباقة أو الحصة الشهرية.
 */
export async function POST(req: NextRequest, { params }: { params: { tenantId: string } }) {
  const tenantId = params.tenantId;
  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;

  try {
    const gate = await withTenant(tenantId, async (tx) => {
      const config = await getOrCreateAiAgentConfig(tx, tenantId);
      const subscription = await tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
      const limits = parseChatbotLimits(subscription?.plan.chatbotLimitsJson ?? null);
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      return { config, subscription, limits, tenantName: tenant?.name ?? "المتجر" };
    });

    if (!gate.config.enabled || !gate.config.websiteWidgetActive) {
      return NextResponse.json({ error: "شات الموقع غير مفعّل حالياً لهذا المتجر" }, { status: 503 });
    }
    if (!gate.limits.websiteChatEnabled || !gate.limits.websiteVoiceCallEnabled) {
      return NextResponse.json({ error: "المكالمة الصوتية غير متاحة في باقة هذا المتجر" }, { status: 403 });
    }

    const minutesUsed = gate.subscription?.voiceCallMinutesUsedThisPeriod ?? 0;
    if (!isUnlimited(gate.limits.maxVoiceCallMinutesPerMonth) && minutesUsed >= gate.limits.maxVoiceCallMinutesPerMonth) {
      return NextResponse.json({ error: "تم استهلاك كامل حصة دقائق المكالمة الصوتية لهذا الشهر" }, { status: 403 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const ipLimit = await checkIpRateLimit(ip, "tenant-voice-call-start", 3, 600);
    if (!ipLimit.allowed) {
      return NextResponse.json({ error: "عدد مكالمات كبير جداً من عنوانك الحالي — حاول مرة أخرى بعد قليل" }, { status: 429 });
    }
    // سقف لكل تاجر (وليس عاماً عبر المنصة كلها كما في النسخة العامة) — منطقي هنا لأن التكلفة تُحسب
    // على حصة هذا التاجر تحديداً، فمهاجم موزَّع على عدة IP لا يفيده تجاوز حد التاجر نفسه.
    const tenantLimit = await checkTenantRateLimit(tenantId, "tenant-voice-call-total", 10, 60);
    if (!tenantLimit.allowed) {
      return NextResponse.json({ error: "عدد المكالمات الصوتية الحالي لهذا المتجر وصل لحده الأقصى المؤقت — حاول بعد قليل" }, { status: 429 });
    }

    const minted = await mintRealtimeClientSecret(buildTenantVoiceCallInstructions(gate.config, gate.tenantName));
    if (!minted) {
      return NextResponse.json({ error: "تعذّر بدء المكالمة الصوتية حالياً" }, { status: 502 });
    }

    if (sessionId) {
      await withTenant(tenantId, async (tx) => {
        const session = await tx.tenantChatSession.findUnique({ where: { id: sessionId } });
        if (session) {
          await tx.tenantChatMessage.create({ data: { tenantId, sessionId, senderType: "VISITOR", text: CALL_START_MARKER, wasVoice: true } });
          await tx.tenantChatSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });
        }
      });
    }

    return NextResponse.json({ clientSecret: minted.clientSecret, expiresAt: minted.expiresAt });
  } catch {
    return NextResponse.json({ error: "متجر غير موجود" }, { status: 404 });
  }
}
