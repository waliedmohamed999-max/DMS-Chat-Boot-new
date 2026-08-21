/** شكل Affiliate.payoutDetailsJson — سجل مرجعي يديره مالك المنصة يدوياً (وليس المسوّق نفسه) لتفاصيل
 * استلامه المفضّلة، لتسهيل معالجة طلبات الصرف الفعلية لاحقاً. منفصل تماماً عن Payout.method (نص حر
 * يكتبه المسوّق نفسه عند كل طلب صرف عبر PayoutRequestForm.tsx) — هذا سجل مرجعي دائم على ملف المسوّق،
 * وذاك تفصيل لحظي لكل طلب على حدة. Sandbox حالياً (بلا تحقّق IBAN/رقم هوية حقيقي)، نفس مستوى بقية
 * بيانات الدفع في المشروع (PaymentMethod مثلاً).
 *
 * paymentType يحدد أي مجموعة حقول ذات صلة (بنكي أو محفظة) — يُخزَّن فقط لتذكّر الاختيار الأخير عند
 * إعادة فتح النموذج للتعديل، وليس قيداً يمنع تعبئة الحقلين معاً لو احتاج الأدمن ذلك فعلياً.
 */
export type AffiliatePayoutDetails = {
  paymentType?: "bank" | "wallet";
  // تحويل بنكي
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string; // منفصل عن IBAN — بعض البنوك المحلية تطلبه بجانب IBAN
  iban?: string;
  swiftCode?: string; // للتحويل الدولي أو من بنوك خارج المملكة
  branchName?: string;
  nationalId?: string; // رقم هوية/إقامة صاحب الحساب — بعض البنوك السعودية تطلبه للتحقق قبل التحويل
  // محفظة إلكترونية (STC Pay وشبهه)
  walletProvider?: string;
  walletNumber?: string;
  notes?: string;
};
