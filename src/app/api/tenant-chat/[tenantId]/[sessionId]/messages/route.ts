import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";

/** نقطة polling خفيفة — نظير /api/platform-chat/[sessionId]/messages، لكن عبر withTenant() لأن هذه
 * بيانات تاجر حقيقية خاضعة لـRLS. تُستخدَم من الـiframe المُضمَّن في موقع التاجر ومن
 * dashboard/website-chat/sessions معاً (نفس نمط استخدام admin/chats لنظيرتها العامة). */
export async function GET(req: NextRequest, { params }: { params: { tenantId: string; sessionId: string } }) {
  const { tenantId, sessionId } = params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "tenant-chat-poll", 60, 60);
  if (!ipLimit.allowed) return NextResponse.json({ error: "طلبات كثيرة جداً" }, { status: 429 });

  const afterId = req.nextUrl.searchParams.get("after");

  try {
    const result = await withTenant(tenantId, async (tx) => {
      const session = await tx.tenantChatSession.findUnique({ where: { id: sessionId }, select: { status: true } });
      if (!session) return null;

      let afterCreatedAt: Date | null = null;
      if (afterId) {
        const afterMessage = await tx.tenantChatMessage.findUnique({ where: { id: afterId }, select: { createdAt: true } });
        afterCreatedAt = afterMessage?.createdAt ?? null;
      }

      const messages = await tx.tenantChatMessage.findMany({
        where: { sessionId, ...(afterCreatedAt ? { createdAt: { gt: afterCreatedAt } } : {}) },
        orderBy: { createdAt: "asc" },
        take: 50,
      });

      return { status: session.status, messages };
    });

    if (!result) return NextResponse.json({ error: "جلسة غير موجودة" }, { status: 404 });

    return NextResponse.json({
      status: result.status,
      messages: result.messages.map((m) => ({
        id: m.id, senderType: m.senderType, text: m.text, wasVoice: m.wasVoice, createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ error: "متجر غير موجود" }, { status: 404 });
  }
}
