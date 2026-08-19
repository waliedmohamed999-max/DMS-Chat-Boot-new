import type { Country } from "@prisma/client";

// سعر باقة لدولة غير السعودية — priceMonthlySar (على الباقة نفسها) يبقى سعر السعودية الأساسي بلا
// تغيير. غياب مفتاح دولة هنا يعني أن الباقة غير مُسعَّرة/غير معروضة لتلك الدولة بعد عمداً — لا
// تحويل عملة تلقائي مُخترَع أبداً، فقط إخفاء حتى يحدد مالك المنصة السعر الحقيقي (راجع
// resolvePlanPrice أدناه وDECISIONS.md).
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
 * سعر باقة فعلي لدولة معينة — السعودية ترجع priceMonthlySar مباشرة دائماً (الأساس، دوماً موجود).
 * الإمارات/مصر ترجعان null إن لم تُسعَّر الباقة لتلك الدولة بعد — المستدعي مسؤول عن إخفاء/رفض
 * الباقة في تلك الحالة بدل افتراض سعر خاطئ (لا تحويل عملة تلقائي في هذه الجولة).
 */
export function resolvePlanPrice(plan: { priceMonthlySar: number; pricingJson: unknown }, country: Country): number | null {
  if (country === "SA") return plan.priceMonthlySar;
  const pricing = parsePlanPricing(plan.pricingJson);
  return pricing[country]?.amount ?? null;
}
