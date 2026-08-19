import type { Country } from "@prisma/client";

// سعر يدوي مخصَّص لباقة بعينها في دولة بعينها — override اختياري فوق التحويل التلقائي بسعر الصرف
// (مثال: تسعير نفسي مقصود لسوق معين، لا يطابق التحويل الحسابي المباشر). غياب المفتاح يعني الاعتماد
// على التحويل التلقائي (راجع resolvePlanPrice) بدل إخفاء الباقة كما كان سابقاً.
export type PlanPricingJson = Partial<Record<"AE" | "EG", { amount: number }>>;

export function parsePlanPricing(raw: unknown): PlanPricingJson {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const result: PlanPricingJson = {};
  for (const key of ["AE", "EG"] as const) {
    const entry = r[key];
    if (entry && typeof entry === "object" && typeof (entry as { amount?: unknown }).amount === "number") {
      result[key] = { amount: (entry as { amount: number }).amount };
    }
  }
  return result;
}

/**
 * سعر باقة فعلي لدولة معينة. السعودية: priceMonthlySar مباشرة دائماً (الأساس). أي دولة أخرى:
 * سعر يدوي مخصَّص من pricingJson إن وُجد، وإلا priceMonthlySar × سعر صرف تلك الدولة
 * (CountryConfig.exchangeRateFromSar، قابل للتعديل من admin/countries) مُقرَّباً لأقرب وحدة صحيحة.
 * يرجع رقماً دائماً — لا مزيد من إخفاء الباقات لعدم التسعير (كل باقة لها سعر محوَّل تلقائياً الآن).
 */
export function resolvePlanPrice(
  plan: { priceMonthlySar: number; pricingJson: unknown },
  countryConfig: { country: Country; exchangeRateFromSar: number }
): number {
  if (countryConfig.country === "SA") return plan.priceMonthlySar;
  const pricing = parsePlanPricing(plan.pricingJson);
  const override = pricing[countryConfig.country as "AE" | "EG"]?.amount;
  if (override !== undefined) return override;
  return Math.round(plan.priceMonthlySar * countryConfig.exchangeRateFromSar);
}
