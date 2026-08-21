import { NextRequest, NextResponse } from "next/server";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { getPlatformSettings } from "@/lib/platformSettings";
import { mintRealtimeClientSecret } from "@/lib/ai/openaiClient";
import { buildPlatformVoiceCallInstructions } from "@/lib/ai/platformVoiceCallInstructions";
import { rawDb } from "@/lib/db";

// سقف عام صريح على مستوى المنصة كلها معاً — دفاع تكلفة حقيقي (بنفس فلسفة platform-chat-total في
// generatePlatformChatReply.ts)، منفصل عن حد الزائر الفردي أعلاه لأنه يمنع مهاجماً يبدأ عدة مكالمات
// من عناوين IP مختلفة/مزيَّفة من تجاوز حد الزائر الواحد. السقف الدولاري النظري الأقصى لهذا الرقم:
// 20 مكالمة/دقيقة × حتى 5 دقائق لكل مكالمة × ~$0.016/دقيقة (تقدير صوت Realtime API التقريبي) ≈ حتى
// $1.6 لكل دقيقة لو استمر معدل البدء الأقصى متتالياً لخمس دقائق كاملة (~$8 إجمالاً لتلك النافذة) —
// سقف نظري توضيحي فقط يستاهل متابعة فعلية من فواتير OpenAI الحقيقية، وليس تعويضاً كاملاً عن المراقبة.
const GLOBAL_CALLS_PER_MINUTE = 20;

/** يصدر توكن Realtime API مؤقتاً لبدء مكالمة صوتية حية — بلا تسجيل دخول، بنفس نمط بقية نقاط
 * platform-chat. لا يُرجع مفتاح OpenAI الحقيقي بأي حال — فقط توكن مؤقت صالح لجلسة واحدة قصيرة. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

  const ipLimit = await checkIpRateLimit(ip, "platform-voice-call-start", 3, 600);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "عدد مكالمات كبير جداً من عنوانك الحالي — حاول مرة أخرى بعد قليل" }, { status: 429 });
  }
  const globalLimit = await checkIpRateLimit("global", "platform-voice-call-total", GLOBAL_CALLS_PER_MINUTE, 60);
  if (!globalLimit.allowed) {
    return NextResponse.json({ error: "عدد المكالمات الصوتية الحالي عبر المنصة وصل لحده الأقصى المؤقت — حاول بعد قليل" }, { status: 429 });
  }

  const settings = await getPlatformSettings();
  if (!settings.platformVoiceCallEnabled) {
    return NextResponse.json({ error: "المكالمة الصوتية غير متاحة حالياً" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;

  const minted = await mintRealtimeClientSecret(buildPlatformVoiceCallInstructions());
  if (!minted) {
    return NextResponse.json({ error: "تعذّر بدء المكالمة الصوتية حالياً" }, { status: 502 });
  }

  if (sessionId) {
    const session = await rawDb.platformChatSession.findUnique({ where: { id: sessionId } });
    if (session) {
      await rawDb.platformChatMessage.create({ data: { sessionId, senderType: "VISITOR", text: "[بدأ مكالمة صوتية]" } });
      await rawDb.platformChatSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });
    }
  }

  return NextResponse.json({ clientSecret: minted.clientSecret, expiresAt: minted.expiresAt });
}
