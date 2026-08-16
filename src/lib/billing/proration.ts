export type ProrationPreview = {
  isUpgrade: boolean;
  isDowngrade: boolean;
  daysRemaining: number;
  totalDaysInPeriod: number;
  /** المبلغ الذي سيُحصَّل الآن فعلياً (0 لو التخفيض يُلغي أي مبلغ إضافي مستحق). */
  dueNow: number;
  /** رصيد الباقة الحالية غير المستخدم (الجزء المتبقي من الدورة الحالية بسعر الباقة القديمة). */
  creditApplied: number;
  nextBillingDate: Date;
  nextBillingAmount: number;
};

/**
 * حساب فرق نسبي (Proration) حقيقي بين الباقة الحالية والجديدة بناءً على الأيام المتبقية من الدورة
 * الحالية — رياضيات بسيطة لا تحتاج مزوّد دفع حقيقي، تعمل بنفس الدقة بغض النظر عن حالة تكامل الدفع.
 */
export function calculateProration(
  currentPlanPriceSar: number,
  newPlanPriceSar: number,
  periodStart: Date,
  periodEnd: Date,
  now: Date = new Date()
): ProrationPreview {
  const totalMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const remainingMs = Math.max(0, periodEnd.getTime() - now.getTime());
  const fractionRemaining = remainingMs / totalMs;

  const creditApplied = Math.round(currentPlanPriceSar * fractionRemaining);
  const proratedNewCharge = Math.round(newPlanPriceSar * fractionRemaining);
  const dueNow = Math.max(0, proratedNewCharge - creditApplied);

  return {
    isUpgrade: newPlanPriceSar > currentPlanPriceSar,
    isDowngrade: newPlanPriceSar < currentPlanPriceSar,
    daysRemaining: Math.round(remainingMs / 86400000),
    totalDaysInPeriod: Math.round(totalMs / 86400000),
    dueNow,
    creditApplied,
    nextBillingDate: periodEnd,
    nextBillingAmount: newPlanPriceSar,
  };
}
