import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";

/** نقطة polling خفيفة (نفس نمط /api/inbox/unread-count) — تُستخدَم من الـwidget (كل 3 ثوانٍ أثناء
 * فتح الشات) ومن صفحة الإدارة معاً لجلب أي رسائل جديدة بعد messageId معيّن + حالة الجلسة الحالية. */
export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "platform-chat-poll", 60, 60);
  if (!ipLimit.allowed) return NextResponse.json({ error: "طلبات كثيرة جداً" }, { status: 429 });

  const sessionId = params.sessionId;
  const afterId = req.nextUrl.searchParams.get("after");

  const session = await rawDb.platformChatSession.findUnique({ where: { id: sessionId }, select: { status: true } });
  if (!session) return NextResponse.json({ error: "جلسة غير موجودة" }, { status: 404 });

  let afterCreatedAt: Date | null = null;
  if (afterId) {
    const afterMessage = await rawDb.platformChatMessage.findUnique({ where: { id: afterId }, select: { createdAt: true } });
    afterCreatedAt = afterMessage?.createdAt ?? null;
  }

  const messages = await rawDb.platformChatMessage.findMany({
    where: { sessionId, ...(afterCreatedAt ? { createdAt: { gt: afterCreatedAt } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return NextResponse.json({
    status: session.status,
    messages: messages.map((m) => ({
      id: m.id, senderType: m.senderType, text: m.text, wasVoice: m.wasVoice, createdAt: m.createdAt.toISOString(),
    })),
  });
}
