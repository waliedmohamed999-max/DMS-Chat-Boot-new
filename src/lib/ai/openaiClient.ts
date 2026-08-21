import OpenAI from "openai";
import { getPlatformSettings } from "@/lib/platformSettings";

/**
 * طبقة Adapter واحدة موحّدة لمزوّد الذكاء الاصطناعي (بند 1 في البرومنت: "استدعاء الـLLM يمر عبر
 * طبقة خدمة واحدة، لا استدعاءات متفرقة"). المفتاح مقروء من PlatformSettings (قابل للتعديل من لوحة
 * مالك المنصة بلا إعادة نشر)، مع متغير بيئة OPENAI_API_KEY كاحتياط دفاعي فقط (نفس نمط Meta App
 * Secret تماماً). لا مفتاح = null، والمتصل (generateAiEmployeeReply) يتعامل مع هذا كتحويل صادق
 * لموظف بشري، وليس خطأ غير معالَج أو رد وهمي.
 *
 * تبديل المزوّد لاحقاً (Anthropic Claude مثلاً) = تنفيذ نفس التوقيع في ملف جديد بدل تعديل كل نقطة
 * استدعاء — لا كود آخر في المشروع يستورد حزمة `openai` مباشرة إلا هذا الملف.
 */
export async function getOpenAiClient(): Promise<{ client: OpenAI; model: string } | null> {
  const settings = await getPlatformSettings();
  if (!settings.openAiApiKey) return null;
  // مهلة 15 ثانية — استدعاء LLM يحدث داخل نفس معاملة قاعدة البيانات التي يعمل بها محرك الشات بوت
  // (مطابقةً لإرسال رسائل واتساب الفعلي الذي يحدث بالفعل داخل نفس المعاملة)، فمهلة محدودة إلزامية
  // لتفادي إبقاء معاملة مفتوحة لأجل غير مسمى لو تعطّل مزوّد الذكاء الاصطناعي.
  const client = new OpenAI({ apiKey: settings.openAiApiKey, timeout: 15000, maxRetries: 1 });
  return { client, model: settings.aiModel };
}

// موديل المكالمة الصوتية الحية (Realtime API) — أرخص من gpt-realtime العادي، مناسب لمحادثة
// مبيعات/دعم عادية (قرار صاحب المنصة، راجع DECISIONS.md). صوت "marin" مثال رسمي موثَّق حالياً من
// توثيق OpenAI (developers.openai.com/api/docs/guides/realtime-webrtc)، وليس تخميناً.
const REALTIME_VOICE_MODEL = "gpt-realtime-mini";
const REALTIME_VOICE = "marin";
// نموذج تفريغ صوت الزائر أثناء المكالمة الحية — مسار منفصل تماماً عن transcribeVoiceMessage.ts
// (الرسائل الصوتية المُسجَّلة)، لكن نفس اختيار "whisper-1" الأكثر استقراراً وتوثيقاً.
const REALTIME_INPUT_TRANSCRIPTION_MODEL = "whisper-1";

/**
 * يصدر "توكن مؤقت" (ephemeral client secret) للاتصال المباشر من المتصفح بـRealtime API عبر WebRTC —
 * المفتاح الحقيقي (settings.openAiApiKey) لا يغادر الخادم أبداً؛ التوكن الناتج صالح لجلسة واحدة قصيرة
 * فقط (تنتهي صلاحيته تلقائياً خلال دقيقة تقريباً حسب توثيق OpenAI الحالي).
 *
 * نقطة النهاية (`POST /v1/realtime/client_secrets`) وشكل جسم الطلب مُتحقَّق منهما مباشرة من توثيق
 * OpenAI الرسمي الحالي (developers.openai.com/api/docs/guides/realtime-webrtc) وقت كتابة هذا الكود —
 * ليست ذاكرة قديمة، فهذه الواجهة تغيّرت فعلياً أكثر من مرة (اسم نقطة تبادل SDP صار الآن
 * `/v1/realtime/calls` منفصلاً عن نقطة إصدار التوكن هذه، خلافاً لنسخة beta أقدم بمعامل `model` في
 * الرابط مباشرة). راجع أيضاً ChatWidget.tsx لتبادل SDP الفعلي عبر `/v1/realtime/calls`.
 */
export async function mintRealtimeClientSecret(instructions: string): Promise<{ clientSecret: string; expiresAt: number } | null> {
  const settings = await getPlatformSettings();
  if (!settings.openAiApiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.openAiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_VOICE_MODEL,
          instructions,
          audio: {
            output: { voice: REALTIME_VOICE },
            input: { transcription: { model: REALTIME_INPUT_TRANSCRIPTION_MODEL } },
          },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`❌ فشل إصدار توكن Realtime API مؤقت (${res.status}):`, await res.text().catch(() => ""));
      return null;
    }

    const data = await res.json();
    const clientSecret = data?.client_secret?.value;
    if (typeof clientSecret !== "string" || !clientSecret) return null;

    // expires_at موثَّق بوحدة ثوانٍ (Unix timestamp) بنفس اصطلاح بقية حقول انتهاء الصلاحية في OpenAI
    // API — احتياط دفاعي بافتراض دقيقة واحدة من الآن لو الحقل غائباً لأي سبب غير متوقَّع.
    const expiresAt = typeof data?.client_secret?.expires_at === "number" ? data.client_secret.expires_at * 1000 : Date.now() + 60_000;

    return { clientSecret, expiresAt };
  } catch (err) {
    console.error("❌ فشل إصدار توكن Realtime API مؤقت:", err);
    return null;
  }
}
