import type { Prisma, AiAgentConfig, AiTone } from "@prisma/client";

export type FaqItem = { question: string; answer: string };

const TONE_INSTRUCTIONS_AR: Record<AiTone, string> = {
  FORMAL: "استخدم نبرة رسمية ومهذّبة، بلغة عربية فصحى مبسّطة، بلا عامية أو رموز تعبيرية.",
  FRIENDLY: "استخدم نبرة ودودة ودافئة، بلغة عربية طبيعية قريبة من لهجة العميل نفسه، مع رموز تعبيرية قليلة ومناسبة عند الحاجة.",
  FUN: "استخدم نبرة مرحة وخفيفة الظل (بلا مبالغة أو استهزاء)، بلغة عربية طبيعية، ورموز تعبيرية مناسبة لإضفاء جو ودّي.",
};

/** يجلب (أو ينشئ افتراضياً إن لم يوجد) إعداد الموظف الذكي لتاجر — عبر tx الجاري أصلاً داخل محرك الشات بوت. */
export async function getOrCreateAiAgentConfig(tx: Prisma.TransactionClient, tenantId: string): Promise<AiAgentConfig> {
  return tx.aiAgentConfig.upsert({ where: { tenantId }, update: {}, create: { tenantId } });
}

/**
 * يبني تعليمات النظام (System Prompt) الكاملة من شخصية الموظف الذكي المُعدَّة من التاجر — يُدمَج معها
 * حدود صريحة غير قابلة للتفاوض (لا تخمين أسعار/طلبات، تحويل فوري عند طلب صريح) بصرف النظر عمّا
 * أدخله التاجر، فهذه القواعد جزء من تصميم النظام نفسه وليست قابلة للتعطيل من إعدادات التاجر.
 */
export function buildSystemPrompt(config: AiAgentConfig, tenantName: string): string {
  const faqItems = Array.isArray(config.faqItems) ? (config.faqItems as unknown as FaqItem[]) : [];
  const faqSection = faqItems.length
    ? "\n\nأسئلة شائعة محدَّدة مسبقاً (استخدمها كمرجع مباشر عند تطابق السؤال):\n" +
      faqItems.map((f) => `- س: ${f.question}\n  ج: ${f.answer}`).join("\n")
    : "";

  const storeInfoParts: string[] = [];
  if (config.shippingPolicy) storeInfoParts.push(`سياسة الشحن: ${config.shippingPolicy}`);
  if (config.returnPolicy) storeInfoParts.push(`سياسة الاسترجاع: ${config.returnPolicy}`);
  if (config.workingHours) storeInfoParts.push(`ساعات العمل: ${config.workingHours}`);
  const storeInfoSection = storeInfoParts.length ? "\n\nمعلومات المتجر:\n" + storeInfoParts.map((p) => `- ${p}`).join("\n") : "";

  const boundariesSection = config.boundariesText
    ? `\n\nحدود إضافية وضعها صاحب المتجر (يجب الالتزام بها حرفياً):\n${config.boundariesText}`
    : "";

  return `أنت "${config.agentName}"، موظف خدمة عملاء حقيقي يعمل لدى متجر "${tenantName}" على واتساب.
${TONE_INSTRUCTIONS_AR[config.tone]}

قواعد صارمة غير قابلة للتجاوز:
1. لا تخمّن أبداً سعر منتج أو حالة توفره أو حالة أي طلب — استخدم الأدوات المتاحة لك (get_product_price / get_order_status) للحصول على البيانات الحقيقية أولاً، ثم أجب بناءً على نتيجتها فقط.
2. لو سُئلت عن منتج والأداة لم تجد نتيجة، قل بصراحة إنك لم تجد المنتج ولا تخترع سعراً.
3. لا تناقش المنافسين، ولا تعد بمواعيد توصيل أو ضمانات غير مؤكدة.
4. إن طلب العميل صراحة التحدث مع شخص حقيقي، أو بدت رسالته شكوى/طلب استرجاع مبلغ/تهديداً قانونياً، لا تحاول حل ذلك بنفسك — أعلن أنك ستحوّله لفريق الدعم.
5. أجب بلغة العميل ولهجته قدر الإمكان (فصحى أو عامية حسب أسلوب رسالته).
6. كن مختصراً وواضحاً — رسائل واتساب قصيرة، ليست مقالات.${storeInfoSection}${boundariesSection}${faqSection}`;
}
