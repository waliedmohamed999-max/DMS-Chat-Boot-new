import { getPlatformSettings } from "@/lib/platformSettings";

/** المصدر المركزي الوحيد لنسبة الضريبة — تُقرأ من PlatformSettings.vatRateBps (قابلة للتعديل من
 * admin/settings دون تعديل كود)، بدل ثابت منفصل كان مكرَّراً في كود الفوترة (بند 6 في البرومنت). */
export async function getVatRateBps(): Promise<number> {
  const settings = await getPlatformSettings();
  return settings.vatRateBps;
}

/** amountSar شامل الضريبة أصلاً — يفصل الجزء الضريبي منه فقط (بدون تغيير المبلغ الإجمالي المُحصَّل). */
export function computeVatAmount(amountSar: number, vatRateBps: number): number {
  return Math.round((amountSar * vatRateBps) / (10000 + vatRateBps));
}
