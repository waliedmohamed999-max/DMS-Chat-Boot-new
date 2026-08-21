import Link from "next/link";
import { requireAffiliateSession } from "@/lib/affiliates/session";
import { rawDb, superAdminDb } from "@/lib/db";
import { affiliateLogout } from "@/app/affiliates/login/actions";
import { TIER_RATE_PERCENT, TIER_LABELS_AR, nextTierInfo } from "@/lib/affiliates/tiers";
import { ReferralLinkBox } from "@/components/affiliates/ReferralLinkBox";
import { MarketingToolkit } from "@/components/affiliates/MarketingToolkit";
import { AffiliateFunnelChart } from "@/components/affiliates/AffiliateFunnelChart";
import { PayoutRequestForm } from "@/components/affiliates/PayoutRequestForm";
import { MIN_PAYOUT_SAR } from "@/lib/affiliates/payout";
import type { CommissionStatus } from "@prisma/client";

const COMMISSION_STATUS_LABELS_AR: Record<string, string> = {
  PENDING: "قيد الانتظار (Net 30)",
  APPROVED: "معتمدة — جاهزة للصرف",
  PAID: "مصروفة",
  REVERSED: "معكوسة (استرداد)",
};
const COMMISSION_STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-warning-500/10 text-warning-500",
  APPROVED: "bg-wa-500/10 text-wa-600 dark:text-wa-400",
  PAID: "bg-success-500/10 text-success-500",
  REVERSED: "bg-danger-500/10 text-danger-500",
};
const PAYOUT_STATUS_LABELS_AR: Record<string, string> = {
  PENDING: "بانتظار المعالجة", PROCESSING: "قيد المعالجة", PAID: "تم الصرف", FAILED: "فشل الصرف",
};
const VALID_COMMISSION_STATUSES: CommissionStatus[] = ["PENDING", "APPROVED", "PAID", "REVERSED"];
const PAGE_SIZE = 25;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const FUNNEL_WEEKS = 8;

export default async function AffiliateDashboardPage({
  searchParams,
}: {
  searchParams: { commissionsPage?: string; referralsPage?: string; commissionsStatus?: string };
}) {
  const affiliate = await requireAffiliateSession();

  const commissionsPage = Math.max(1, parseInt(searchParams.commissionsPage ?? "1", 10) || 1);
  const referralsPage = Math.max(1, parseInt(searchParams.referralsPage ?? "1", 10) || 1);
  const commissionsStatus = VALID_COMMISSION_STATUSES.includes(searchParams.commissionsStatus as CommissionStatus)
    ? (searchParams.commissionsStatus as CommissionStatus)
    : null;

  const [referrals, referralsTotal, commissions, commissionsTotal, payouts, clicks] = await Promise.all([
    rawDb.referral.findMany({
      where: { affiliateId: affiliate.id },
      include: { tenant: { select: { name: true, status: true, createdAt: true } }, commissions: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      skip: (referralsPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    rawDb.referral.count({ where: { affiliateId: affiliate.id } }),
    rawDb.commission.findMany({
      where: { affiliateId: affiliate.id, ...(commissionsStatus ? { status: commissionsStatus } : {}) },
      include: { referral: { include: { tenant: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      skip: (commissionsPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    rawDb.commission.count({ where: { affiliateId: affiliate.id, ...(commissionsStatus ? { status: commissionsStatus } : {}) } }),
    rawDb.payout.findMany({ where: { affiliateId: affiliate.id }, orderBy: { requestedAt: "desc" } }),
    rawDb.referralClick.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" } }),
  ]);

  // إجماليات القمع (نقرات/تحويلات) عابرة للصفحات — تحتاج عدداً كلياً حقيقياً بصرف النظر عن صفحة
  // جدول الإحالات المعروضة حالياً، لذلك عدّاد منفصل بلا take.
  const allReferralsForFunnel = await rawDb.referral.findMany({
    where: { affiliateId: affiliate.id },
    select: { convertedAt: true, source: true },
  });

  // Invoice محمي بـRLS — لا يمكن الوصول له عبر rawDb.commission.findMany({ include: { invoice } })
  // (JOIN عبر اتصال app_runtime بلا app.current_tenant_id يُرجع null فيفشل Prisma لأن العلاقة
  // إلزامية). عمولات المسوّق تعبر عدة مستأجرين مختلفين، فلا يوجد withTenant() واحد مناسب — يُقرأ
  // عبر superAdminDb بشكل منفصل، بنفس نمط lib/admin/revenueAnalytics.ts للتقارير العابرة للمستأجرين.
  const invoiceAmountById = new Map(
    (
      await superAdminDb.invoice.findMany({
        where: { id: { in: commissions.map((c) => c.invoiceId) } },
        select: { id: true, amountSar: true },
      })
    ).map((inv) => [inv.id, inv.amountSar])
  );

  const pendingSar = commissions.filter((c) => c.status === "PENDING").reduce((s, c) => s + c.amountSar, 0);
  const approvedAvailableSar = commissions.filter((c) => c.status === "APPROVED" && !c.payoutId).reduce((s, c) => s + c.amountSar, 0);
  const paidSar = commissions.filter((c) => c.status === "PAID").reduce((s, c) => s + c.amountSar, 0);
  const lifetimeSar = commissions.filter((c) => c.status !== "REVERSED").reduce((s, c) => s + c.amountSar, 0);
  const paidReferredCount = referrals.filter((r) => r.commissions.length > 0).length;
  const next = nextTierInfo(affiliate.tier);

  // قمع التحويل: إجمالي النقرات مقابل إجمالي التحويلات (عابر لصفحات جدول الإحالات) — صفر بأمان لو
  // لا نقرات بعد (بدل قسمة على صفر).
  const totalClicks = clicks.length;
  const totalReferrals = allReferralsForFunnel.length;
  const overallConversionRate = totalClicks > 0 ? (totalReferrals / totalClicks) * 100 : 0;

  // اتجاه أسبوعي (آخر 8 أسابيع) — الأقدم أولاً (يسار) وصولاً للأسبوع الحالي (يمين)، نفس ترتيب
  // last7Days في dashboard/page.tsx.
  const now = Date.now();
  const weeksAgo = (d: Date) => Math.floor((now - d.getTime()) / WEEK_MS);
  const funnelBuckets = Array.from({ length: FUNNEL_WEEKS }, () => ({ clicks: 0, referrals: 0 }));
  for (const c of clicks) {
    const idx = weeksAgo(c.createdAt);
    if (idx >= 0 && idx < FUNNEL_WEEKS) funnelBuckets[idx]!.clicks++;
  }
  for (const r of allReferralsForFunnel) {
    const idx = weeksAgo(r.convertedAt);
    if (idx >= 0 && idx < FUNNEL_WEEKS) funnelBuckets[idx]!.referrals++;
  }
  const funnelData = funnelBuckets
    .map((b, i) => ({ weekLabel: i === 0 ? "الحالي" : `-${i}أ`, clicks: b.clicks, referrals: b.referrals }))
    .reverse();

  // الأداء حسب القناة — تجميع النقرات والتحويلات حسب source ("عام" لو null).
  const channelKeys = new Set<string>(["عام"]);
  for (const c of clicks) channelKeys.add(c.source ?? "عام");
  for (const r of allReferralsForFunnel) channelKeys.add(r.source ?? "عام");
  const channelStats = [...channelKeys].map((channel) => {
    const channelClicks = clicks.filter((c) => (c.source ?? "عام") === channel).length;
    const channelReferrals = allReferralsForFunnel.filter((r) => (r.source ?? "عام") === channel).length;
    return {
      channel,
      clicks: channelClicks,
      referrals: channelReferrals,
      rate: channelClicks > 0 ? (channelReferrals / channelClicks) * 100 : 0,
    };
  });

  const referralsTotalPages = Math.max(1, Math.ceil(referralsTotal / PAGE_SIZE));
  const commissionsTotalPages = Math.max(1, Math.ceil(commissionsTotal / PAGE_SIZE));

  function buildQuery(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams();
    if (searchParams.commissionsPage) params.set("commissionsPage", searchParams.commissionsPage);
    if (searchParams.referralsPage) params.set("referralsPage", searchParams.referralsPage);
    if (commissionsStatus) params.set("commissionsStatus", commissionsStatus);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  return (
    <div className="min-h-screen bg-navy-900 pb-16 text-slate-100">
      <header className="flex items-center justify-between border-b border-white/5 bg-navy-900/80 px-6 py-4 backdrop-blur">
        <div>
          <p className="text-sm font-semibold text-white">لوحة المسوّق — {affiliate.name}</p>
          <p className="text-xs text-slate-500">{affiliate.email}</p>
        </div>
        <form action={affiliateLogout}>
          <button className="text-sm text-slate-400 hover:text-white">تسجيل الخروج</button>
        </form>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        {/* رابط الإحالة */}
        <div className="card p-5">
          <h2 className="mb-1 font-semibold text-white">رابط الإحالة الخاص بك</h2>
          <p className="mb-3 text-xs text-slate-500">شارك هذا الرابط — أي زائر يسجّل خلال 90 يوماً من زيارته يُنسَب لك تلقائياً.</p>
          <ReferralLinkBox code={affiliate.referralCode} />
        </div>

        {/* نظرة عامة */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card p-5">
            <p className="text-xs text-slate-500">مستواك الحالي</p>
            <p className="mt-1 text-2xl font-bold text-white">{TIER_LABELS_AR[affiliate.tier]}</p>
            <p className="mt-1 text-xs text-wa-400">{TIER_RATE_PERCENT[affiliate.tier]}% عمولة على كل دفعة</p>
          </div>
          <div className="card p-5">
            <p className="text-xs text-slate-500">عملاء مدفوعون</p>
            <p className="mt-1 text-2xl font-bold text-white">{paidReferredCount}</p>
            {next ? (
              <p className="mt-1 text-xs text-slate-500">
                {Math.max(0, next.neededCount - paidReferredCount)} عميل حتى {TIER_LABELS_AR[next.tier]} ({TIER_RATE_PERCENT[next.tier]}%)
              </p>
            ) : (
              <p className="mt-1 text-xs text-success-500">أعلى مستوى ✓</p>
            )}
          </div>
          <div className="card p-5">
            <p className="text-xs text-slate-500">قيد الانتظار (Net 30)</p>
            <p className="mt-1 text-2xl font-bold text-warning-500">{pendingSar.toLocaleString("ar-SA")} ر.س</p>
          </div>
          <div className="card p-5">
            <p className="text-xs text-slate-500">معتمد ومتاح للصرف</p>
            <p className="mt-1 text-2xl font-bold text-wa-400">{approvedAvailableSar.toLocaleString("ar-SA")} ر.س</p>
          </div>
        </div>

        {/* قمع التحويل */}
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-white">قمع التحويل</h2>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">إجمالي النقرات</p>
              <p className="mt-1 text-2xl font-bold text-white" dir="ltr">{totalClicks.toLocaleString("ar-SA")}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">إجمالي التحويلات</p>
              <p className="mt-1 text-2xl font-bold text-white" dir="ltr">{totalReferrals.toLocaleString("ar-SA")}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">معدّل التحويل الإجمالي</p>
              <p className="mt-1 text-2xl font-bold text-wa-400" dir="ltr">{overallConversionRate.toFixed(1)}%</p>
            </div>
          </div>
          <AffiliateFunnelChart data={funnelData} />
        </div>

        {/* الأداء حسب القناة */}
        <div className="card overflow-hidden p-0">
          <h2 className="p-5 pb-3 font-semibold text-white">الأداء حسب القناة</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-white/5 bg-white/[0.02] text-right text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">القناة</th>
                  <th className="px-5 py-2 font-medium">النقرات</th>
                  <th className="px-5 py-2 font-medium">التحويلات</th>
                  <th className="px-5 py-2 font-medium">معدّل التحويل</th>
                </tr>
              </thead>
              <tbody>
                {channelStats.map((s) => (
                  <tr key={s.channel} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-2.5 text-white">{s.channel}</td>
                    <td className="px-5 py-2.5 text-slate-400" dir="ltr">{s.clicks}</td>
                    <td className="px-5 py-2.5 text-slate-400" dir="ltr">{s.referrals}</td>
                    <td className="px-5 py-2.5 text-wa-400" dir="ltr">{s.rate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* أدوات تسويقية */}
        <MarketingToolkit referralCode={affiliate.referralCode} affiliateName={affiliate.name} />

        {/* طلب الصرف */}
        <div className="card p-5">
          <h2 className="mb-1 font-semibold text-white">صرف الرصيد</h2>
          <p className="mb-3 text-xs text-slate-500">
            الحد الأدنى للصرف {MIN_PAYOUT_SAR} ر.س. رصيدك المعتمد حالياً {approvedAvailableSar.toLocaleString("ar-SA")} ر.س،
            وإجمالي ما استلمته حتى الآن {paidSar.toLocaleString("ar-SA")} ر.س (من إجمالي {lifetimeSar.toLocaleString("ar-SA")} ر.س عمولات مستحقة).
          </p>
          {approvedAvailableSar >= MIN_PAYOUT_SAR ? (
            <PayoutRequestForm />
          ) : (
            <p className="text-xs text-slate-500">لم تصل بعد للحد الأدنى للصرف.</p>
          )}
        </div>

        {/* سجل العمولات */}
        <div className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
            <h2 className="font-semibold text-white">سجل العمولات</h2>
            <form method="get" className="flex items-center gap-2">
              {searchParams.referralsPage && <input type="hidden" name="referralsPage" value={searchParams.referralsPage} />}
              <label className="text-xs text-slate-500">فلترة حسب الحالة:</label>
              <select name="commissionsStatus" defaultValue={commissionsStatus ?? ""} className="input-field text-xs">
                <option value="">كل الحالات</option>
                {VALID_COMMISSION_STATUSES.map((s) => (
                  <option key={s} value={s}>{COMMISSION_STATUS_LABELS_AR[s]}</option>
                ))}
              </select>
              <button type="submit" className="btn-secondary text-xs">تطبيق</button>
            </form>
          </div>
          {commissions.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500">لا توجد عمولات بعد — شارك رابطك للبدء.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-y border-white/5 bg-white/[0.02] text-right text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-2 font-medium">العميل</th>
                      <th className="px-5 py-2 font-medium">قيمة الفاتورة</th>
                      <th className="px-5 py-2 font-medium">النسبة</th>
                      <th className="px-5 py-2 font-medium">عمولتك</th>
                      <th className="px-5 py-2 font-medium">الحالة</th>
                      <th className="px-5 py-2 font-medium">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map((c) => (
                      <tr key={c.id} className="border-b border-white/5 last:border-0">
                        <td className="px-5 py-2.5">{c.referral.tenant.name}</td>
                        <td className="px-5 py-2.5 text-slate-400">{(invoiceAmountById.get(c.invoiceId) ?? 0).toLocaleString("ar-SA")} ر.س</td>
                        <td className="px-5 py-2.5 text-slate-400">{c.ratePercent}%</td>
                        <td className="px-5 py-2.5 font-semibold text-white">{c.amountSar.toLocaleString("ar-SA")} ر.س</td>
                        <td className="px-5 py-2.5">
                          <span className={`badge ${COMMISSION_STATUS_BADGE[c.status]}`}>{COMMISSION_STATUS_LABELS_AR[c.status]}</span>
                        </td>
                        <td className="px-5 py-2.5 text-xs text-slate-500">{c.createdAt.toLocaleDateString("ar-SA")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {commissionsTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 border-t border-white/5 p-3 text-sm">
                  <Link
                    href={buildQuery({ commissionsPage: String(Math.max(1, commissionsPage - 1)) })}
                    aria-disabled={commissionsPage <= 1}
                    className={commissionsPage <= 1 ? "pointer-events-none text-slate-600" : "text-slate-300 hover:text-white"}
                  >
                    السابق
                  </Link>
                  <span className="text-xs text-slate-500" dir="ltr">{commissionsPage} / {commissionsTotalPages}</span>
                  <Link
                    href={buildQuery({ commissionsPage: String(Math.min(commissionsTotalPages, commissionsPage + 1)) })}
                    aria-disabled={commissionsPage >= commissionsTotalPages}
                    className={commissionsPage >= commissionsTotalPages ? "pointer-events-none text-slate-600" : "text-slate-300 hover:text-white"}
                  >
                    التالي
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* سجل الإحالات */}
        <div className="card overflow-hidden p-0">
          <h2 className="p-5 pb-3 font-semibold text-white">التجّار المُحالون</h2>
          {referrals.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500">لا يوجد تجّار مُحالون بعد.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-y border-white/5 bg-white/[0.02] text-right text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-2 font-medium">اسم النشاط</th>
                      <th className="px-5 py-2 font-medium">القناة</th>
                      <th className="px-5 py-2 font-medium">تاريخ التسجيل</th>
                      <th className="px-5 py-2 font-medium">هل دفع بعد؟</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((r) => (
                      <tr key={r.id} className="border-b border-white/5 last:border-0">
                        <td className="px-5 py-2.5">{r.tenant.name}</td>
                        <td className="px-5 py-2.5 text-xs text-slate-400">{r.source ?? "عام"}</td>
                        <td className="px-5 py-2.5 text-xs text-slate-500">{r.convertedAt.toLocaleDateString("ar-SA")}</td>
                        <td className="px-5 py-2.5">
                          {r.commissions.length > 0 ? (
                            <span className="badge bg-success-500/10 text-success-500">نعم</span>
                          ) : (
                            <span className="badge bg-white/5 text-slate-400">ليس بعد</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {referralsTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 border-t border-white/5 p-3 text-sm">
                  <Link
                    href={buildQuery({ referralsPage: String(Math.max(1, referralsPage - 1)) })}
                    aria-disabled={referralsPage <= 1}
                    className={referralsPage <= 1 ? "pointer-events-none text-slate-600" : "text-slate-300 hover:text-white"}
                  >
                    السابق
                  </Link>
                  <span className="text-xs text-slate-500" dir="ltr">{referralsPage} / {referralsTotalPages}</span>
                  <Link
                    href={buildQuery({ referralsPage: String(Math.min(referralsTotalPages, referralsPage + 1)) })}
                    aria-disabled={referralsPage >= referralsTotalPages}
                    className={referralsPage >= referralsTotalPages ? "pointer-events-none text-slate-600" : "text-slate-300 hover:text-white"}
                  >
                    التالي
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* سجل الصرف */}
        {payouts.length > 0 && (
          <div className="card overflow-hidden p-0">
            <h2 className="p-5 pb-3 font-semibold text-white">طلبات الصرف</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-white/5 bg-white/[0.02] text-right text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">المبلغ</th>
                    <th className="px-5 py-2 font-medium">الطريقة</th>
                    <th className="px-5 py-2 font-medium">الحالة</th>
                    <th className="px-5 py-2 font-medium">تاريخ الطلب</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id} className="border-b border-white/5 last:border-0">
                      <td className="px-5 py-2.5 font-semibold text-white">{p.amountSar.toLocaleString("ar-SA")} ر.س</td>
                      <td className="px-5 py-2.5 text-slate-400">{p.method ?? "—"}</td>
                      <td className="px-5 py-2.5">
                        <span className={`badge ${p.status === "PAID" ? "bg-success-500/10 text-success-500" : p.status === "FAILED" ? "bg-danger-500/10 text-danger-500" : "bg-warning-500/10 text-warning-500"}`}>
                          {PAYOUT_STATUS_LABELS_AR[p.status]}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-slate-500">{p.requestedAt.toLocaleDateString("ar-SA")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
