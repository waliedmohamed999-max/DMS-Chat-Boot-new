import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";

// نفس النصّين الحرفيين المُستخدَمين في realtime-token/route.ts (بداية) وChatWidget.tsx::endCall
// (نهاية، مُعاد استخدامه حرفياً في صفحة الـembed) — علامتان صريحتان بدل حقل DateTime منفصل لبداية
// المكالمة، لأن كل جزء من المكالمة أصلاً يمر عبر هذا المسار كرسالة عادية.
const CALL_START_MARKER = "[بدأت مكالمة صوتية]";
const CALL_END_MARKER = "[انتهت المكالمة الصوتية]";

/** يخزّن جزءاً مكتملاً من نص مكالمة صوتية حية (زائر أو مساعد) كـTenantChatMessage عادية — نظير
 * /api/platform-chat/[sessionId]/voice-transcript، مع إضافة تتبّع دقائق المكالمة الشهري لكل تاجر: عند
 * وصول علامة النهاية، نبحث عن أحدث علامة بداية لنفس الجلسة ونزيد الفارق الزمني (بالدقائق، مُقرَّباً
 * للأعلى) على Subscription.voiceCallMinutesUsedThisPeriod. */
export async function POST(req: NextRequest, { params }: { params: { tenantId: string; sessionId: string } }) {
  const { tenantId, sessionId } = params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "tenant-voice-transcript", 60, 60);
  if (!ipLimit.allowed) return NextResponse.json({ error: "طلبات كثيرة جداً" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const role = body?.role === "ai" ? "AI" : body?.role === "visitor" ? "VISITOR" : null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!role || !text) return NextResponse.json({ error: "role وtext مطلوبان" }, { status: 400 });

  try {
    const result = await withTenant(tenantId, async (tx) => {
      const session = await tx.tenantChatSession.findUnique({ where: { id: sessionId } });
      if (!session) return null;

      await tx.tenantChatMessage.create({ data: { tenantId, sessionId, senderType: role, text, wasVoice: true } });
      await tx.tenantChatSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });

      if (text === CALL_END_MARKER) {
        const startMarker = await tx.tenantChatMessage.findFirst({
          where: { sessionId, text: CALL_START_MARKER },
          orderBy: { createdAt: "desc" },
        });
        if (startMarker) {
          const elapsedMinutes = Math.max(1, Math.ceil((Date.now() - startMarker.createdAt.getTime()) / 60_000));
          await tx.subscription.updateMany({ where: { tenantId }, data: { voiceCallMinutesUsedThisPeriod: { increment: elapsedMinutes } } });
        }
      }

      return true;
    });

    if (!result) return NextResponse.json({ error: "جلسة غير موجودة" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "متجر غير موجود" }, { status: 404 });
  }
}
