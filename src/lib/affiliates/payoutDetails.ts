/** شكل Affiliate.payoutDetailsJson — سجل مرجعي يديره مالك المنصة يدوياً (وليس المسوّق نفسه) لتفاصيل
 * استلامه المفضّلة، لتسهيل معالجة طلبات الصرف الفعلية لاحقاً. منفصل تماماً عن Payout.method (نص حر
 * يكتبه المسوّق نفسه عند كل طلب صرف عبر PayoutRequestForm.tsx) — هذا سجل مرجعي دائم على ملف المسوّق،
 * وذاك تفصيل لحظي لكل طلب على حدة. Sandbox حالياً (بلا تحقّق IBAN حقيقي)، نفس مستوى بقية بيانات
 * الدفع في المشروع (PaymentMethod مثلاً).
 */
export type AffiliatePayoutDetails = {
  bankName?: string;
  accountHolderName?: string;
  iban?: string;
  notes?: string;
};
