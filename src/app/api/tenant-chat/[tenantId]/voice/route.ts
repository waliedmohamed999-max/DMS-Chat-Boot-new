import { NextRequest, NextResponse } from "next/server";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { getOpenAiClient } from "@/lib/ai/openaiClient";
import { getTenantChatbotLimits } from "@/lib/planLimits";
import { withTenant } from "@/lib/db";
import { processTenantChatMessage } from "@/lib/tenantChat";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB — نفس حد /api/platform-chat/voice بالضبط

/**
 * نظير /api/platform-chat/voice تماماً (تفريغ Whisper من الذاكرة، رد صوتي TTS اختياري عبر ترويسات
 * X-*)، لكن يفحص بوابة الباقة + تفعيل التاجر **قبل** استدعاء Whisper — تفريغ صوتي له تكلفة فعلية
 * حقيقية على مفتاح OpenAI المشترك للمنصة، فلا يصح إنفاقها على تاجر لا يملك هذه الميزة أصلاً.
 */
export async function POST(req: NextRequest, { params }: { params: { tenantId: string } }) {
  const tenantId = params.tenantId;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "tenant-chat-voice", 10, 60);
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

  try {
    const limits = await getTenantChatbotLimits(tenantId);
    if (!limits.websiteChatEnabled) {
      return NextResponse.json({ error: "شات الموقع غير متاح لهذا المتجر" }, { status: 403 });
    }
    const config = await withTenant(tenantId, (tx) => tx.aiAgentConfig.findUnique({ where: { tenantId } }));
    if (!config?.enabled || !config?.websiteWidgetActive) {
      return NextResponse.json({ error: "شات الموقع غير مفعّل حالياً لهذا المتجر" }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: "متجر غير موجود" }, { status: 404 });
  }

  const openai = await getOpenAiClient();
  if (!openai) return NextResponse.json({ error: "لم يُضبَط مزوّد الذكاء الاصطناعي بعد من إعدادات المنصة" }, { status: 503 });

  let transcript: string;
  try {
    const transcription = await openai.client.audio.transcriptions.create({ file: audio, model: "whisper-1" });
    transcript = transcription.text?.trim() ?? "";
  } catch (err) {
    console.error("❌ فشل تفريغ الرسالة الصوتية عبر Whisper (شات موقع تاجر):", err);
    return NextResponse.json({ error: "تعذّر تفريغ الرسالة الصوتية — جرّب مرة أخرى" }, { status: 502 });
  }
  if (!transcript) {
    return NextResponse.json({ error: "لم يتم التعرّف على أي كلام في التسجيل — جرّب مرة أخرى بصوت أوضح" }, { status: 422 });
  }

  try {
    const result = await processTenantChatMessage(tenantId, sessionId, transcript, true);
    if (result.kind === "error") {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }

    const replyText = result.replyText;
    if (replyText) {
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
        console.error("❌ فشل توليد الرد الصوتي (TTS) — يُكتفى بالرد النصي (شات موقع تاجر):", err);
        // فشل TTS لا يُفشل الطلب كاملاً — الرد النصي وصل بالفعل عبر processTenantChatMessage أعلاه
      }
    }

    return NextResponse.json({ transcript, replyText, sessionStatus: result.sessionStatus });
  } catch {
    return NextResponse.json({ error: "متجر غير موجود" }, { status: 404 });
  }
}
