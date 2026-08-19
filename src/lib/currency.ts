import type { Country } from "@prisma/client";

// مصدر واحد لرمز كل عملة وتنسيقها — يستبدل نصوص "ر.س" الثابتة المبعثرة سابقاً في عشرات ملفات
// الواجهة. ثابت متزامن بلا أي استعلام قاعدة بيانات عمداً (قابل للاستيراد من مكوّنات العميل مباشرة)
// — بعكس CountryConfig (عملة/ضريبة قابلة للتعديل من الإدارة فعلياً)، هذا فقط رمز العرض النصي.
export const CURRENCY_SYMBOLS: Record<string, string> = {
  SAR: "ر.س",
  AED: "د.إ",
  EGP: "ج.م",
};

export const COUNTRY_TO_CURRENCY: Record<Country, string> = {
  SA: "SAR",
  AE: "AED",
  EG: "EGP",
};

export const COUNTRY_LABELS_AR: Record<Country, string> = {
  SA: "السعودية",
  AE: "الإمارات",
  EG: "مصر",
};

/** تنسيق مبلغ بعملته — نفس فواصل الآلاف العربية (ar-SA) المستخدمة أصلاً في كل عرض مبلغ بالمنصة. */
export function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${amount.toLocaleString("ar-SA")} ${symbol}`;
}
