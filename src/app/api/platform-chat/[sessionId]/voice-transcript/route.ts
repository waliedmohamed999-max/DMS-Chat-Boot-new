import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";

/** يخزّن جزءاً مكتملاً من نص مكالمة صوتية حية (زائر أو مساعد) كـPlatformChatMessage عادية — Realtime
 * API يفرّغ الصوت تلقائياً كجزء من تدفق أحداثه (راجع ChatWidget.tsx)، فلا حاجة لاستدعاء Whisper هنا
 * إطلاقاً. بهذا يظهر transcript المكالمة كاملاً في /admin/chats بلا أي تعديل على تلك الصفحة. */
export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "platform-voice-transcript", 60, 60);
  if (!ipLimit.allowed) return NextResponse.json({ error: "طلبات كثيرة جداً" }, { status: 429 });

  const sessionId = params.sessionId;
  const body = await req.json().catch(() => null);
  const role = body?.role === "ai" ? "AI" : body?.role === "visitor" ? "VISITOR" : null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!role || !text) return NextResponse.json({ error: "role وtext مطلوبان" }, { status: 400 });

  const session = await rawDb.platformChatSession.findUnique({ where: { id: sessionId } });
  if (!session) return NextResponse.json({ error: "جلسة غير موجودة" }, { status: 404 });

  await rawDb.platformChatMessage.create({ data: { sessionId, senderType: role, text, wasVoice: true } });
  await rawDb.platformChatSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });

  return NextResponse.json({ ok: true });
}
