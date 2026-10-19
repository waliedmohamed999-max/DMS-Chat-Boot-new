import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { monthlyUsageByTenant, startOfMonth } from "@/lib/billing/wallet";

export const metadata = { title: "محافظ الرسائل — DMS Tech" };

export default async function AdminWalletsPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.view_revenue")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض المحافظ.</div>;
  }

  const [wallets, usage, recharges] = await Promise.all([
    superAdminDb.walletBalance.findMany({ include: { tenant: { select: { name: true, status: true } } }, orderBy: { balance: "asc" } }),
    monthlyUsageByTenant(),
    superAdminDb.walletTransaction.aggregate({ where: { type: "RECHARGE", createdAt: { gte: startOfMonth() } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const totals = [...usage.values()].reduce((a, u) => ({ revenue: a.revenue + u.revenue, margin: a.margin + u.margin, messages: a.messages + u.messages }), { revenue: 0, margin: 0, messages: 0 });
  const totalBalance = wallets.reduce((n, w) => n + Number(w.balance), 0);
  const stats = [
    { label: "أرصدة التجار الحالية (التزام على المنصة)", value: `${totalBalance.toFixed(2)} ر.س` },
    { label: "شحنات هذا الشهر", value: `${Number(recharges._sum.amount ?? 0).toFixed(2)} ر.س (${recharges._count._all})` },
    { label: "استهلاك رسائل هذا الشهر", value: `${totals.revenue.toFixed(2)} ر.س · ${totals.messages.toLocaleString("ar-SA")} رسالة` },
    { label: "صافي هامش المنصة هذا الشهر", value: `${totals.margin.toFixed(2)} ر.س` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">محافظ رسائل التجار</h1>
        <p className="text-sm text-slate-400">أرصدة التجار المسبقة الدفع لرسائل واتساب عبر 360dialog — الأقل رصيداً أولاً.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="mt-1 text-lg font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {wallets.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">لا توجد محافظ بعد — تُنشأ تلقائياً عند أول شحن أو أول رسالة مدفوعة.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-right text-xs text-slate-500">
                <th className="p-3 font-medium">التاجر</th>
                <th className="p-3 font-medium">الرصيد</th>
                <th className="p-3 font-medium">حد التنبيه</th>
                <th className="p-3 font-medium">استهلاك الشهر</th>
                <th className="p-3 font-medium">هامش المنصة</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => {
                const u = usage.get(w.tenantId);
                const low = w.balance.lessThan(w.minAlert);
                return (
                  <tr key={w.id} className="border-b border-white/5">
                    <td className="p-3 font-medium text-white">{w.tenant.name}</td>
                    <td className={`p-3 font-semibold ${low ? "text-warning-500" : "text-white"}`} dir="ltr">{Number(w.balance).toFixed(2)} SAR</td>
                    <td className="p-3 text-slate-400" dir="ltr">{Number(w.minAlert).toFixed(2)}</td>
                    <td className="p-3 text-slate-300">{u ? `${u.revenue.toFixed(2)} ر.س (${u.messages})` : "—"}</td>
                    <td className="p-3 text-slate-300" dir="ltr">{u ? u.margin.toFixed(2) : "—"}</td>
                    <td className="p-3 text-left"><Link href={`/admin/wallets/${w.tenantId}`} className="btn-secondary text-xs">التفاصيل</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
