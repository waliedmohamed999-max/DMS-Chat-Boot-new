import { superAdminDb } from "@/lib/db";
import { resolvePlanPrice } from "@/lib/planPricing";
import { COUNTRY_TO_CURRENCY } from "@/lib/currency";

const MONTH_LABELS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

// كل مبلغ هنا Record<عملة, رقم> — لا يُجمَع مبلغان بعملتين مختلفتين في رقم واحد أبداً (نفس مبدأ
// دفتر القيود في lib/accounting/balances.ts). تاجر إماراتي مشترك بباقة "النمو" يُحسَب بسعرها
// الفعلي بالدرهم (Plan.pricingJson.AE)، وليس بـpriceMonthlySar السعودي الخام.
export type CurrencyAmounts = Record<string, number>;

export type RevenueSummary = {
  mrr: CurrencyAmounts;
  arr: CurrencyAmounts;
  churnPercent: CurrencyAmounts;
  renewals7d: number;
  renewals30d: number;
  planDistribution: { planId: string; name: string; count: number; revenue: CurrencyAmounts }[];
  mrrTrend: { label: string; amounts: CurrencyAmounts }[];
};

function addTo(bucket: CurrencyAmounts, currency: string, amount: number) {
  bucket[currency] = (bucket[currency] ?? 0) + amount;
}

/**
 * كل رقم هنا محسوب فعلياً من صفوف حقيقية (اشتراكات/فواتير) — لا قيم ثابتة (بند "كل رقم يجب أن يكون
 * حقيقياً" في برومنت التدقيق). ملاحظتان منهجيتان موثَّقتان أيضاً في DECISIONS.md:
 * 1) **churnPercent**: النظام لا يخزّن تاريخ حالة الاشتراك (لا جدول تتبّع انتقالات)، فيُحسَب كنسبة
 *    "MRR المفقود من اشتراكات أُلغيت هذا الشهر" إلى "MRR بداية الشهر التقديري" (= MRR الحالي + المفقود)
 *    — لكل عملة على حدة الآن.
 * 2) **mrrTrend**: بلا لقطات MRR تاريخية فعلية، يُحسَب كـ"الإيراد المفوتَر شهرياً" (مجموع صافي قيمة
 *    الفواتير المدفوعة قبل الضريبة لكل شهر من آخر 12 شهراً)، مؤشر قياسي بديل مقبول لاتجاه MRR — رقم
 *    حقيقي محسوب من فواتير فعلية (invoice.currency الحقيقي لكل فاتورة)، وليس بيانات وهمية.
 */
export async function computeRevenueSummary(): Promise<RevenueSummary> {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [activeSubs, cancelledThisMonth, renewals7d, renewals30d] = await Promise.all([
    superAdminDb.subscription.findMany({ where: { status: { in: ["ACTIVE", "TRIALING"] } }, include: { plan: true, tenant: { select: { country: true } } } }),
    superAdminDb.subscription.findMany({ where: { status: "CANCELLED", updatedAt: { gte: monthStart } }, include: { plan: true, tenant: { select: { country: true } } } }),
    superAdminDb.subscription.count({ where: { currentPeriodEnd: { gte: now, lte: in7Days } } }),
    superAdminDb.subscription.count({ where: { currentPeriodEnd: { gte: now, lte: in30Days } } }),
  ]);

  const mrr: CurrencyAmounts = {};
  const byPlan = new Map<string, { name: string; count: number; revenue: CurrencyAmounts }>();
  for (const s of activeSubs) {
    const currency = COUNTRY_TO_CURRENCY[s.tenant.country];
    const price = resolvePlanPrice(s.plan, s.tenant.country);
    if (price === null) continue; // باقة مخصصة/غير مُسعَّرة لدولة هذا التاجر — لا مساهمة رقمية وهمية
    addTo(mrr, currency, price);

    const entry = byPlan.get(s.planId) ?? { name: s.plan.name, count: 0, revenue: {} };
    entry.count += 1;
    addTo(entry.revenue, currency, price);
    byPlan.set(s.planId, entry);
  }
  const arr: CurrencyAmounts = {};
  for (const [currency, amount] of Object.entries(mrr)) arr[currency] = amount * 12;

  const churnedMrr: CurrencyAmounts = {};
  for (const s of cancelledThisMonth) {
    const currency = COUNTRY_TO_CURRENCY[s.tenant.country];
    const price = resolvePlanPrice(s.plan, s.tenant.country);
    if (price === null) continue;
    addTo(churnedMrr, currency, price);
  }
  const churnPercent: CurrencyAmounts = {};
  const allChurnCurrencies = new Set([...Object.keys(mrr), ...Object.keys(churnedMrr)]);
  for (const currency of allChurnCurrencies) {
    const churned = churnedMrr[currency] ?? 0;
    const startOfMonth = (mrr[currency] ?? 0) + churned;
    churnPercent[currency] = startOfMonth > 0 ? Math.round((churned / startOfMonth) * 1000) / 10 : 0;
  }

  const planDistribution = Array.from(byPlan.entries()).map(([planId, v]) => ({ planId, ...v }));

  const twelveMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const paidInvoicesLast12Months = await superAdminDb.invoice.findMany({
    where: { status: "PAID", createdAt: { gte: twelveMonthsAgoStart } },
    select: { amountSar: true, vatAmountSar: true, currency: true, createdAt: true },
  });

  const monthlyRevenue = new Map<string, CurrencyAmounts>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    monthlyRevenue.set(`${d.getFullYear()}-${d.getMonth()}`, {});
  }
  for (const inv of paidInvoicesLast12Months) {
    const key = `${inv.createdAt.getFullYear()}-${inv.createdAt.getMonth()}`;
    const bucket = monthlyRevenue.get(key);
    if (bucket) addTo(bucket, inv.currency, inv.amountSar - inv.vatAmountSar);
  }
  const mrrTrend = Array.from(monthlyRevenue.entries()).map(([key, amounts]) => {
    const month = Number(key.split("-")[1]);
    return { label: MONTH_LABELS_AR[month] ?? "", amounts };
  });

  return { mrr, arr, churnPercent, renewals7d, renewals30d, planDistribution, mrrTrend };
}
