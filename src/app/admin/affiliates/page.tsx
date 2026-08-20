import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { rawDb } from "@/lib/db";
import { TIER_LABELS_AR, TIER_RATE_PERCENT } from "@/lib/affiliates/tiers";
import { approveAffiliate, rejectAffiliate, markPayoutPaid, markPayoutFailed } from "./actions";

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

  const [pending, allAffiliates, pendingPayouts, aggregates] = await Promise.all([
    rawDb.affiliate.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    rawDb.affiliate.findMany({
      where: { status: { not: "PENDING" } },
      include: { _count: { select: { referrals: true } } },
      orderBy: { createdAt: "desc" },
    }),
    rawDb.payout.findMany({ where: { status: "PENDING" }, include: { affiliate: { select: { name: true, email: true } } }, orderBy: { requestedAt: "asc" } }),
    rawDb.commission.groupBy({ by: ["status"], _sum: { amountSar: true } }),
  ]);

  const sumByStatus = (status: string) => aggregates.find((a) => a.status === status)?._sum.amountSar ?? 0;
  const activeCount = allAffiliates.filter((a) => a.status === "ACTIVE").length;
  const totalReferred = allAffiliates.reduce((s, a) => s + a._count.referrals, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">برنامج التسويق بالعمولة</h1>
        <p className="text-sm text-slate-400">مراجعة طلبات الانضمام، متابعة العمولات، واعتماد طلبات الصرف.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5"><p className="text-xs text-slate-500">مسوّقون نشطون</p><p className="mt-1 text-2xl font-bold text-white">{activeCount}</p></div>
        <div className="card p-5"><p className="text-xs text-slate-500">إجمالي التجّار المُحالين</p><p className="mt-1 text-2xl font-bold text-white">{totalReferred}</p></div>
        <div className="card p-5"><p className="text-xs text-slate-500">عمولات معتمدة (غير مصروفة)</p><p className="mt-1 text-2xl font-bold text-wa-400">{sumByStatus("APPROVED").toLocaleString("ar-SA")} ر.س</p></div>
        <div className="card p-5"><p className="text-xs text-slate-500">إجمالي مصروف حتى الآن</p><p className="mt-1 text-2xl font-bold text-success-500">{sumByStatus("PAID").toLocaleString("ar-SA")} ر.س</p></div>
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
