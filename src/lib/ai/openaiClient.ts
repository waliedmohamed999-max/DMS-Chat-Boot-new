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
