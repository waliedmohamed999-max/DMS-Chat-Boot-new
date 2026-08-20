import { NextRequest, NextResponse } from "next/server";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { processPlatformChatMessage } from "@/lib/platformChat";

export async function POST(req: NextRequest) {
  // حد بعنوان IP قبل أي تحقّق أو كتابة قاعدة بيانات (نفس نمط webhooks الموثَّق في lib/rateLimit.ts) —
  // طبقة منفصلة عن حدّي الجلسة/العام داخل generatePlatformChatReply نفسها (تحمي استدعاء LLM تحديداً)،
  // هذه هنا تحمي حتى مجرد كتابة PlatformChatMessage في القاعدة من إغراق مباشر.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "platform-chat-message", 30, 60);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "عدد رسائل كبير جداً من عنوانك الحالي — حاول مرة أخرى بعد قليل" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const text = typeof body?.text === "string" ? body.text : "";
  if (!sessionId || !text.trim()) {
    return NextResponse.json({ error: "sessionId ونص الرسالة مطلوبان" }, { status: 400 });
  }

  const result = await processPlatformChatMessage(sessionId, text, false);
  if (result.kind === "error") {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({ replyText: result.replyText, sessionStatus: result.sessionStatus });
}
