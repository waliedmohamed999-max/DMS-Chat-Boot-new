import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { rawDb, superAdminDb } from "@/lib/db";
import { TIER_LABELS_AR, TIER_RATE_PERCENT } from "@/lib/affiliates/tiers";
import { buildWeeklyFunnelData, buildChannelBreakdown } from "@/lib/affiliates/funnel";
import { AffiliateFunnelChart } from "@/components/affiliates/AffiliateFunnelChart";
import { suspendAffiliate, reactivateAffiliate, setAffiliateTier, markPayoutPaid, markPayoutFailed } from "../actions";

const STATUS_LABELS_AR: Record<string, string> = { PENDING: "بانتظار المراجعة", ACTIVE: "نشط", SUSPENDED: "معلَّق", REJECTED: "مرفوض" };
const COMMISSION_STATUS_LABELS_AR: Record<string, string> = {
  PENDING: "قيد الانتظار", APPROVED: "معتمدة", PAID: "مصروفة", REVERSED: "معكوسة",
};

export default async function AdminAffiliateDetailPage({ params }: { params: { id: string } }) {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.affiliates.manage")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية إدارة برنامج التسويق بالعمولة.</div>;
  }

  const affiliate = await rawDb.affiliate.findUnique({ where: { id: params.id } });
  if (!affiliate) notFound();

  const [referrals, commissions, payouts, clicks] = await Promise.all([
    rawDb.referral.findMany({
      where: { affiliateId: affiliate.id },
      include: { tenant: { select: { name: true, status: true } }, commissions: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    }),
    rawDb.commission.findMany({
      where: { affiliateId: affiliate.id },
      include: { referral: { include: { tenant: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    rawDb.payout.findMany({ where: { affiliateId: affiliate.id }, orderBy: { requestedAt: "desc" } }),
    rawDb.referralClick.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" } }),
  ]);

  // نفس السبب الموثَّق في affiliates/dashboard/page.tsx: Invoice محمي بـRLS، فيُقرأ عبر superAdminDb منفصلاً.
  const invoiceAmountById = new Map(
    (
      await superAdminDb.invoice.findMany({
        where: { id: { in: commissions.map((c) => c.invoiceId) } },
        select: { id: true, amountSar: true },
      })
    ).map((inv) => [inv.id, inv.amountSar])
  );

  const lifetimeSar = commissions.filter((c) => c.status !== "REVERSED").reduce((s, c) => s + c.amountSar, 0);

  // referrals تحمل convertedAt/source الكافيين لـbuildWeeklyFunnelData/buildChannelBreakdown بلا
  // استعلام إضافي — نفس مصدر الحقيقة الوحيد المُستخدَم في affiliates/dashboard/page.tsx وadmin/affiliates/page.tsx.
  const funnelData = buildWeeklyFunnelData(clicks, referrals);
  const channelStats = buildChannelBreakdown(clicks, referrals);
  const personalConversionRate = clicks.length > 0 ? (referrals.length / clicks.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/affiliates" className="text-xs text-slate-500 hover:text-slate-300">← برنامج التسويق بالعمولة</Link>
          <h1 className="mt-1 text-xl font-bold text-white">{affiliate.name}</h1>
          <p className="text-sm text-slate-400" dir="ltr">{affiliate.email} · {affiliate.phone}</p>
        </div>
        <div className="flex gap-2">
          {affiliate.status === "ACTIVE" && (
            <form action={suspendAffiliate.bind(null, affiliate.id)}>
              <button className="badge bg-danger-500/10 text-danger-500">تعليق الحساب</button>
            </form>
          )}
          {affiliate.status === "SUSPENDED" && (
            <form action={reactivateAffiliate.bind(null, affiliate.id)}>
              <button className="badge bg-success-500/10 text-success-500">إعادة التفعيل</button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-5"><p className="text-xs text-slate-500">الحالة</p><p className="mt-1 font-semibold text-white">{STATUS_LABELS_AR[affiliate.status]}</p></div>
        <div className="card p-5">
          <p className="text-xs text-slate-500">المستوى</p>
          <form action={async (formData: FormData) => {
            "use server";
            await setAffiliateTier(affiliate.id, formData.get("tier") as "STARTER" | "GROWTH" | "ELITE");
          }} className="mt-1">
            <select name="tier" defaultValue={affiliate.tier} className="input-field text-sm">
              <option value="STARTER">{TIER_LABELS_AR.STARTER} ({TIER_RATE_PERCENT.STARTER}%)</option>
              <option value="GROWTH">{TIER_LABELS_AR.GROWTH} ({TIER_RATE_PERCENT.GROWTH}%)</option>
              <option value="ELITE">{TIER_LABELS_AR.ELITE} ({TIER_RATE_PERCENT.ELITE}%)</option>
            </select>
            <button type="submit" className="mt-2 w-full rounded-md bg-white/5 py-1 text-xs text-slate-300 hover:bg-white/10">حفظ المستوى يدوياً</button>
          </form>
        </div>
        <div className="card p-5"><p className="text-xs text-slate-500">عدد الإحالات</p><p className="mt-1 text-2xl font-bold text-white">{referrals.length}</p></div>
        <div className="card p-5"><p className="text-xs text-slate-500">إجمالي العمولات المستحقة</p><p className="mt-1 text-2xl font-bold text-wa-400">{lifetimeSar.toLocaleString("ar-SA")} ر.س</p></div>
        <div className="card p-5">
          <p className="text-xs text-slate-500">عدد النقرات</p>
          <p className="mt-1 text-2xl font-bold text-white" dir="ltr">{clicks.length}</p>
          <p className="mt-1 text-xs text-wa-400" dir="ltr">معدّل تحويل شخصي {personalConversionRate.toFixed(1)}%</p>
        </div>
      </div>

      {affiliate.promotionPlan && (
        <div className="card p-5">
          <p className="text-xs text-slate-500">خطة الترويج المذكورة وقت التقديم</p>
          <p className="mt-1 text-sm text-slate-300">{affiliate.promotionPlan}</p>
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-4 font-semibold text-white">اتجاه النقرات والتحويلات (آخر 8 أسابيع)</h2>
        <AffiliateFunnelChart data={funnelData} />
      </div>

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
                  <td className="px-5 py-2.5 text-wa-400" dir="ltr">{s.conversionRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <h2 className="p-5 pb-3 font-semibold text-white">العمولات</h2>
        {commissions.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">لا توجد عمولات بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-white/5 bg-white/[0.02] text-right text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">العميل</th>
                  <th className="px-5 py-2 font-medium">قيمة الفاتورة</th>
                  <th className="px-5 py-2 font-medium">العمولة</th>
                  <th className="px-5 py-2 font-medium">الحالة</th>
                  <th className="px-5 py-2 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-2.5">{c.referral.tenant.name}</td>
                    <td className="px-5 py-2.5 text-slate-400">{(invoiceAmountById.get(c.invoiceId) ?? 0).toLocaleString("ar-SA")} ر.س</td>
                    <td className="px-5 py-2.5 font-semibold text-white">{c.amountSar.toLocaleString("ar-SA")} ر.س ({c.ratePercent}%)</td>
                    <td className="px-5 py-2.5 text-slate-400">{COMMISSION_STATUS_LABELS_AR[c.status]}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500">{c.createdAt.toLocaleDateString("ar-SA")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        <h2 className="p-5 pb-3 font-semibold text-white">طلبات الصرف</h2>
        {payouts.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">لا توجد طلبات صرف بعد.</p>
        ) : (
          <div className="space-y-3 p-5 pt-0">
            {payouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-4">
                <div>
                  <p className="font-semibold text-white">{p.amountSar.toLocaleString("ar-SA")} ر.س</p>
                  <p className="text-xs text-slate-500">{p.method} · {p.requestedAt.toLocaleDateString("ar-SA")}</p>
                  {p.reference && <p className="text-xs text-slate-500">مرجع: {p.reference}</p>}
                </div>
                {p.status === "PENDING" ? (
                  <div className="flex gap-2">
                    <form action={markPayoutPaid.bind(null, p.id, "")}>
                      <button className="badge bg-success-500/10 text-success-500">تم الصرف فعلياً</button>
                    </form>
                    <form action={markPayoutFailed.bind(null, p.id)}>
                      <button className="badge bg-danger-500/10 text-danger-500">فشل الصرف</button>
                    </form>
                  </div>
                ) : (
                  <span className={`badge ${p.status === "PAID" ? "bg-success-500/10 text-success-500" : "bg-danger-500/10 text-danger-500"}`}>
                    {p.status === "PAID" ? "تم الصرف" : "فشل"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
