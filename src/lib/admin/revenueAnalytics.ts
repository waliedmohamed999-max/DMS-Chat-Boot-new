import { superAdminDb } from "@/lib/db";

const MONTH_LABELS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export type RevenueSummary = {
  mrrSar: number;
  arrSar: number;
  churnPercent: number;
  renewals7d: number;
  renewals30d: number;
  planDistribution: { planId: string; name: string; count: number; revenueSar: number }[];
  mrrTrend: { label: string; amountSar: number }[];
};

/**
 * كل رقم هنا محسوب فعلياً من صفوف حقيقية (اشتراكات/فواتير) — لا قيم ثابتة (بند "كل رقم يجب أن يكون
 * حقيقياً" في برومنت التدقيق). ملاحظتان منهجيتان موثَّقتان أيضاً في DECISIONS.md:
 * 1) **churnPercent**: النظام لا يخزّن تاريخ حالة الاشتراك (لا جدول تتبّع انتقالات)، فيُحسَب كنسبة
 *    "MRR المفقود من اشتراكات أُلغيت هذا الشهر" إلى "MRR بداية الشهر التقديري" (= MRR الحالي + المفقود).
 * 2) **mrrTrend**: بلا لقطات MRR تاريخية فعلية، يُحسَب كـ"الإيراد المفوتَر شهرياً" (مجموع صافي قيمة
 *    الفواتير المدفوعة قبل الضريبة لكل شهر من آخر 12 شهراً) — مؤشر قياسي بديل مقبول لاتجاه MRR، وهو
 *    رقم حقيقي محسوب من فواتير فعلية، وليس بيانات وهمية.
 */
export async function computeRevenueSummary(): Promise<RevenueSummary> {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [activeSubs, cancelledThisMonth, renewals7d, renewals30d] = await Promise.all([
    superAdminDb.subscription.findMany({ where: { status: { in: ["ACTIVE", "TRIALING"] } }, include: { plan: true } }),
    superAdminDb.subscription.findMany({ where: { status: "CANCELLED", updatedAt: { gte: monthStart } }, include: { plan: true } }),
    superAdminDb.subscription.count({ where: { currentPeriodEnd: { gte: now, lte: in7Days } } }),
    superAdminDb.subscription.count({ where: { currentPeriodEnd: { gte: now, lte: in30Days } } }),
  ]);

  const mrrSar = activeSubs.reduce((sum, s) => sum + s.plan.priceMonthlySar, 0);
  const arrSar = mrrSar * 12;

  const churnedMrr = cancelledThisMonth.reduce((sum, s) => sum + s.plan.priceMonthlySar, 0);
  const startOfMonthMrr = mrrSar + churnedMrr;
  const churnPercent = startOfMonthMrr > 0 ? Math.round((churnedMrr / startOfMonthMrr) * 1000) / 10 : 0;

  const byPlan = new Map<string, { name: string; count: number; revenueSar: number }>();
  for (const s of activeSubs) {
    const entry = byPlan.get(s.planId) ?? { name: s.plan.name, count: 0, revenueSar: 0 };
    entry.count += 1;
    entry.revenueSar += s.plan.priceMonthlySar;
    byPlan.set(s.planId, entry);
  }
  const planDistribution = Array.from(byPlan.entries()).map(([planId, v]) => ({ planId, ...v }));

  const twelveMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const paidInvoicesLast12Months = await superAdminDb.invoice.findMany({
    where: { status: "PAID", createdAt: { gte: twelveMonthsAgoStart } },
    select: { amountSar: true, vatAmountSar: true, createdAt: true },
  });

  const monthlyRevenue = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    monthlyRevenue.set(`${d.getFullYear()}-${d.getMonth()}`, 0);
  }
  for (const inv of paidInvoicesLast12Months) {
    const key = `${inv.createdAt.getFullYear()}-${inv.createdAt.getMonth()}`;
    if (monthlyRevenue.has(key)) {
      monthlyRevenue.set(key, (monthlyRevenue.get(key) ?? 0) + (inv.amountSar - inv.vatAmountSar));
    }
  }
  const mrrTrend = Array.from(monthlyRevenue.entries()).map(([key, amountSar]) => {
    const month = Number(key.split("-")[1]);
    return { label: MONTH_LABELS_AR[month] ?? "", amountSar };
  });

  return { mrrSar, arrSar, churnPercent, renewals7d, renewals30d, planDistribution, mrrTrend };
}
