import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { rawDb } from "@/lib/db";
import { TIER_LABELS_AR, TIER_RATE_PERCENT } from "@/lib/affiliates/tiers";
import { buildWeeklyFunnelData, buildChannelBreakdown } from "@/lib/affiliates/funnel";
import { AffiliateFunnelChart } from "@/components/affiliates/AffiliateFunnelChart";
import { CreateAffiliateButton } from "./CreateAffiliateButton";
import { approveAffiliate, rejectAffiliate, markPayoutPaid, markPayoutFailed } from "./actions";

const TOP_AFFILIATES_COUNT = 10;

const STATUS_LABELS_AR: Record<string, string> = { PENDING: "بانتظار المراجعة", ACTIVE: "نشط", SUSPENDED: "معلَّق", REJECTED: "مرفوض" };
const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-warning-500/10 text-warning-500",
  ACTIVE: "bg-success-500/10 text-success-500",
  SUSPENDED: "bg-danger-500/10 text-danger-500",
  REJECTED: "bg-white/5 text-slate-400",
};

export default async function AdminAffiliatesPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.affiliates.manage")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية إدارة برنامج التسويق بالعمولة.</div>;
  }

  const [pending, allAffiliates, pendingPayouts, aggregates, allClicks, allReferralsForFunnel, commissionSums, paidReferrals] = await Promise.all([
    rawDb.affiliate.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    rawDb.affiliate.findMany({
      where: { status: { not: "PENDING" } },
      include: { _count: { select: { referrals: true } } },
      orderBy: { createdAt: "desc" },
    }),
    rawDb.payout.findMany({ where: { status: "PENDING" }, include: { affiliate: { select: { name: true, email: true } } }, orderBy: { requestedAt: "asc" } }),
    rawDb.commission.groupBy({ by: ["status"], _sum: { amountSar: true } }),
    rawDb.referralClick.findMany({ select: { createdAt: true, source: true, affiliateId: true } }),
    rawDb.referral.findMany({ select: { convertedAt: true, source: true } }),
    rawDb.commission.groupBy({ by: ["affiliateId"], where: { status: { not: "REVERSED" } }, _sum: { amountSar: true } }),
    // نفس نمط recalculateAffiliateTiers في commissionSync.ts بالضبط: إحالة "مدفوعة" = لديها عمولة
    // واحدة على الأقل — مُجمَّعة هنا مرة واحدة عبر كل المسوّقين بدل استعلام منفصل لكل مسوّق (N+1).
    rawDb.referral.findMany({ where: { commissions: { some: {} } }, select: { affiliateId: true } }),
  ]);

  const sumByStatus = (status: string) => aggregates.find((a) => a.status === status)?._sum.amountSar ?? 0;
  const activeCount = allAffiliates.filter((a) => a.status === "ACTIVE").length;
  const totalReferred = allAffiliates.reduce((s, a) => s + a._count.referrals, 0);

  const totalClicks = allClicks.length;
  const overallConversionRate = totalClicks > 0 ? (totalReferred / totalClicks) * 100 : 0;
  const funnelData = buildWeeklyFunnelData(allClicks, allReferralsForFunnel);
  const channelStats = buildChannelBreakdown(allClicks, allReferralsForFunnel);

  const commissionSumByAffiliateId = new Map(commissionSums.map((c) => [c.affiliateId, c._sum.amountSar ?? 0]));
  const clicksByAffiliateId = new Map<string, number>();
  for (const c of allClicks) clicksByAffiliateId.set(c.affiliateId, (clicksByAffiliateId.get(c.affiliateId) ?? 0) + 1);
  const paidReferralsByAffiliateId = new Map<string, number>();
  for (const r of paidReferrals) paidReferralsByAffiliateId.set(r.affiliateId, (paidReferralsByAffiliateId.get(r.affiliateId) ?? 0) + 1);

  const topAffiliates = allAffiliates
    .map((a) => {
      const totalCommissionSar = commissionSumByAffiliateId.get(a.id) ?? 0;
      const affiliateClicks = clicksByAffiliateId.get(a.id) ?? 0;
      const paidReferralsCount = paidReferralsByAffiliateId.get(a.id) ?? 0;
      return {
        affiliate: a,
        totalCommissionSar,
        affiliateClicks,
        paidReferralsCount,
        conversionRate: affiliateClicks > 0 ? (paidReferralsCount / affiliateClicks) * 100 : 0,
      };
    })
    .sort((a, b) => b.totalCommissionSar - a.totalCommissionSar)
    .slice(0, TOP_AFFILIATES_COUNT);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">برنامج التسويق بالعمولة</h1>
          <p className="text-sm text-slate-400">مراجعة طلبات الانضمام، متابعة العمولات، واعتماد طلبات الصرف.</p>
        </div>
        <CreateAffiliateButton />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-5"><p className="text-xs text-slate-500">مسوّقون نشطون</p><p className="mt-1 text-2xl font-bold text-white">{activeCount}</p></div>
        <div className="card p-5"><p className="text-xs text-slate-500">إجمالي التجّار المُحالين</p><p className="mt-1 text-2xl font-bold text-white">{totalReferred}</p></div>
        <div className="card p-5">
          <p className="text-xs text-slate-500">إجمالي النقرات</p>
          <p className="mt-1 text-2xl font-bold text-white" dir="ltr">{totalClicks.toLocaleString("ar-SA")}</p>
          <p className="mt-1 text-xs text-wa-400" dir="ltr">معدّل تحويل عام {overallConversionRate.toFixed(1)}%</p>
        </div>
        <div className="card p-5"><p className="text-xs text-slate-500">عمولات معتمدة (غير مصروفة)</p><p className="mt-1 text-2xl font-bold text-wa-400">{sumByStatus("APPROVED").toLocaleString("ar-SA")} ر.س</p></div>
        <div className="card p-5"><p className="text-xs text-slate-500">إجمالي مصروف حتى الآن</p><p className="mt-1 text-2xl font-bold text-success-500">{sumByStatus("PAID").toLocaleString("ar-SA")} ر.س</p></div>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 font-semibold text-white">اتجاه النقرات والتحويلات عبر كل المسوّقين (آخر 8 أسابيع)</h2>
        <AffiliateFunnelChart data={funnelData} />
      </div>

      <div className="card overflow-hidden p-0">
        <h2 className="p-5 pb-3 font-semibold text-white">الأداء حسب القناة (عبر كل المسوّقين)</h2>
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
                  <td className="px-5 py-2.5 text-wa-400" dir="ltr">{s.conversionRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <h2 className="p-5 pb-3 font-semibold text-white">أفضل المسوّقين</h2>
        {topAffiliates.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">لا توجد بيانات كافية بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-white/5 bg-white/[0.02] text-right text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">الاسم</th>
                  <th className="px-5 py-2 font-medium">المستوى</th>
                  <th className="px-5 py-2 font-medium">إحالات مدفوعة</th>
                  <th className="px-5 py-2 font-medium">النقرات</th>
                  <th className="px-5 py-2 font-medium">معدّل التحويل</th>
                  <th className="px-5 py-2 font-medium">إجمالي العمولات</th>
                </tr>
              </thead>
              <tbody>
                {topAffiliates.map((t) => (
                  <tr key={t.affiliate.id} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-2.5">
                      <Link href={`/admin/affiliates/${t.affiliate.id}`} className="font-medium text-white hover:underline">{t.affiliate.name}</Link>
                    </td>
                    <td className="px-5 py-2.5 text-slate-400">{TIER_LABELS_AR[t.affiliate.tier]} ({TIER_RATE_PERCENT[t.affiliate.tier]}%)</td>
                    <td className="px-5 py-2.5 text-slate-400" dir="ltr">{t.paidReferralsCount}</td>
                    <td className="px-5 py-2.5 text-slate-400" dir="ltr">{t.affiliateClicks}</td>
                    <td className="px-5 py-2.5 text-slate-400" dir="ltr">{t.conversionRate.toFixed(1)}%</td>
                    <td className="px-5 py-2.5 font-semibold text-wa-400">{t.totalCommissionSar.toLocaleString("ar-SA")} ر.س</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-white">طلبات انضمام بانتظار المراجعة ({pending.length})</h2>
          <div className="space-y-3">
            {pending.map((a) => (
              <div key={a.id} className="rounded-lg border border-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{a.name}</p>
                    <p className="text-xs text-slate-400" dir="ltr">{a.email} · {a.phone}</p>
                  </div>
                  <div className="flex gap-2">
                    <form action={approveAffiliate.bind(null, a.id)}>
                      <button className="badge bg-success-500/10 text-success-500">قبول</button>
                    </form>
                    <form action={rejectAffiliate.bind(null, a.id, "غير مناسب لبرنامج التسويق بالعمولة")}>
                      <button className="badge bg-danger-500/10 text-danger-500">رفض</button>
                    </form>
                  </div>
                </div>
                {a.promotionPlan && <p className="mt-2 text-xs leading-relaxed text-slate-400">{a.promotionPlan}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingPayouts.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-white">طلبات صرف بانتظار المعالجة ({pendingPayouts.length})</h2>
          <div className="space-y-3">
            {pendingPayouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-4">
                <div>
                  <p className="font-semibold text-white">{p.amountSar.toLocaleString("ar-SA")} ر.س — {p.affiliate.name}</p>
                  <p className="text-xs text-slate-400" dir="ltr">{p.affiliate.email}</p>
                  <p className="mt-1 text-xs text-slate-500">طريقة الاستلام: {p.method}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={markPayoutPaid.bind(null, p.id, "")} className="flex gap-1.5">
                    <button className="badge bg-success-500/10 text-success-500">تم الصرف فعلياً</button>
                  </form>
                  <form action={markPayoutFailed.bind(null, p.id)}>
                    <button className="badge bg-danger-500/10 text-danger-500">فشل الصرف</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <h2 className="p-5 pb-3 font-semibold text-white">كل المسوّقين ({allAffiliates.length})</h2>
        {allAffiliates.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">لا يوجد مسوّقون بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-white/5 bg-white/[0.02] text-right text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">الاسم</th>
                  <th className="px-5 py-2 font-medium">المستوى</th>
                  <th className="px-5 py-2 font-medium">عدد الإحالات</th>
                  <th className="px-5 py-2 font-medium">الحالة</th>
                  <th className="px-5 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {allAffiliates.map((a) => (
                  <tr key={a.id} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-2.5">
                      <Link href={`/admin/affiliates/${a.id}`} className="font-medium text-white hover:underline">{a.name}</Link>
                      <p className="text-xs text-slate-500" dir="ltr">{a.email}</p>
                    </td>
                    <td className="px-5 py-2.5 text-slate-400">{TIER_LABELS_AR[a.tier]} ({TIER_RATE_PERCENT[a.tier]}%)</td>
                    <td className="px-5 py-2.5 text-slate-400">{a._count.referrals}</td>
                    <td className="px-5 py-2.5"><span className={`badge ${STATUS_BADGE[a.status]}`}>{STATUS_LABELS_AR[a.status]}</span></td>
                    <td className="px-5 py-2.5 text-left">
                      <Link href={`/admin/affiliates/${a.id}`} className="text-xs text-wa-400 hover:underline">التفاصيل ←</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
