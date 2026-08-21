/** أحرف لاتينية/أرقام/شرطة فقط (يظهر الكود داخل رابط URL: ?ref=CODE) — مصدر واحد للتوليد العشوائي
 * وصيغة التحقق، يُستخدَم من التقديم الذاتي (affiliates/apply/actions.ts) وتعديل/إنشاء الأدمن اليدوي
 * (admin/affiliates/actions.ts) معاً. موحَّد لحالة أحرف كبيرة دائماً (normalizeReferralCode) لتفادي
 * التباس تطابق حساس لحالة الأحرف عند مطابقة الكود في /api/affiliates/click وresolveReferralAffiliateId.
 */
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

/** عشوائي بالكامل، وليس مشتقاً من الاسم، لتفادي أي تسريب معلومة شخصية داخل رابط عام يُنشَر على وسائل التواصل. */
export function generateReferralCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}
