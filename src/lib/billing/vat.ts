import type { Country } from "@prisma/client";
import { getCountryConfig } from "@/lib/billing/countryConfig";

/** المصدر المركزي الوحيد لنسبة الضريبة — تُقرأ من CountryConfig الخاص بدولة التاجر (قابلة للتعديل
 * من admin/countries دون تعديل كود)، بدل نسبة عالمية واحدة (PlatformSettings.vatRateBps القديمة،
 * لم تعد المصدر الفعلي بعد إضافة دعم تعدد الدول — راجع تعليق الحقل في schema.prisma). */
export async function getVatRateBps(country: Country): Promise<number> {
  const config = await getCountryConfig(country);
  return config.vatRateBps;
}

/** amountSar شامل الضريبة أصلاً — يفصل الجزء الضريبي منه فقط (بدون تغيير المبلغ الإجمالي المُحصَّل). */
export function computeVatAmount(amountSar: number, vatRateBps: number): number {
  return Math.round((amountSar * vatRateBps) / (10000 + vatRateBps));
}
