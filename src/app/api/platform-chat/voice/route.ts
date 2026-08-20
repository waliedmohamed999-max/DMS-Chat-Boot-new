import { NextRequest, NextResponse } from "next/server";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { getOpenAiClient } from "@/lib/ai/openaiClient";
import { getPlatformSettings } from "@/lib/platformSettings";
import { processPlatformChatMessage } from "@/lib/platformChat";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB — حد أقصى معقول لتسجيل صوتي حتى 60 ثانية بجودة عادية

/**
 * يستقبل تسجيلاً صوتياً (multipart/form-data)، يُفرِّغه عبر Whisper مباشرة من الذاكرة (بلا أي
 * fs.writeFile — لا بنية تخزين ملفات في هذا المشروع أصلاً، راجع DECISIONS.md)، ثم يمرّر النص المُفرَّغ
 * لنفس منطق /message المشترك. لو platformChatVoiceReplyEnabled مفعَّلة، يُعاد أيضاً رد صوتي (TTS) —
 * يُبَث مباشرة في جسم الاستجابة (audio/mpeg) بلا أي تخزين على الخادم، والبيانات الوصفية (النص
 * المُفرَّغ/نص الرد/حالة الجلسة) تصل عبر ترويسات مخصَّصة (X-*) لاستحالة مزج نوعي محتوى في استجابة واحدة.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "platform-chat-voice", 10, 60);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "عدد رسائل صوتية كبير جداً من عنوانك الحالي — حاول مرة أخرى بعد قليل" }, { status: 429 });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });

  const sessionId = String(formData.get("sessionId") ?? "");
  const audio = formData.get("audio");
  if (!sessionId || !(audio instanceof File)) {
    return NextResponse.json({ error: "sessionId وملف صوتي مطلوبان" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "الملف الصوتي كبير جداً (الحد الأقصى 10 ميجابايت)" }, { status: 400 });
  }

  const openai = await getOpenAiClient();
  if (!openai) return NextResponse.json({ error: "لم يُضبَط مزوّد الذكاء الاصطناعي بعد من إعدادات المنصة" }, { status: 503 });

  let transcript: string;
  try {
    const transcription = await openai.client.audio.transcriptions.create({ file: audio, model: "whisper-1" });
    transcript = transcription.text?.trim() ?? "";
  } catch (err) {
    console.error("❌ فشل تفريغ الرسالة الصوتية عبر Whisper:", err);
    return NextResponse.json({ error: "تعذّر تفريغ الرسالة الصوتية — جرّب مرة أخرى" }, { status: 502 });
  }
  if (!transcript) {
    return NextResponse.json({ error: "لم يتم التعرّف على أي كلام في التسجيل — جرّب مرة أخرى بصوت أوضح" }, { status: 422 });
  }

  const result = await processPlatformChatMessage(sessionId, transcript, true);
  if (result.kind === "error") {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  const replyText = result.replyText;
  const settings = await getPlatformSettings();

  if (replyText && settings.platformChatVoiceReplyEnabled) {
    try {
      const speech = await openai.client.audio.speech.create({ model: "tts-1", voice: "alloy", input: replyText });
      const audioBuffer = Buffer.from(await speech.arrayBuffer());
      return new NextResponse(audioBuffer, {
        headers: {
          "Content-Type": "audio/mpeg",
          "X-Transcript": encodeURIComponent(transcript),
          "X-Reply-Text": encodeURIComponent(replyText),
          "X-Session-Status": result.sessionStatus,
        },
      });
    } catch (err) {
      console.error("❌ فشل توليد الرد الصوتي (TTS) — يُكتفى بالرد النصي:", err);
      // فشل TTS لا يُفشل الطلب كاملاً — الرد النصي وصل بالفعل عبر processPlatformChatMessage أعلاه
    }
  }

  return NextResponse.json({ transcript, replyText, sessionStatus: result.sessionStatus });
}
