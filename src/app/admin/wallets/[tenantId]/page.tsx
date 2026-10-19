import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { CATEGORY_LABELS, getWallet, startOfMonth, type MessageCategory } from "@/lib/billing/wallet";
import { AdjustWalletForm, MinAlertForm } from "./WalletAdminForms";

export const metadata = { title: "محفظة تاجر — DMS Tech" };

const TX_LABELS: Record<string, { label: string; className: string }> = {
  RECHARGE: { label: "شحن", className: "text-success-500" },
  DEBIT: { label: "خصم رسالة", className: "text-slate-300" },
  REFUND: { label: "استرداد", className: "text-accent-400" },
  ADJUSTMENT: { label: "تعديل يدوي", className: "text-warning-500" },
};

export default async function AdminTenantWalletPage(props: { params: Promise<{ tenantId: string }> }) {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.view_revenue")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض المحافظ.</div>;
  }
  const canManage = hasEffectivePermission(session.user.permissions, "platform.billing.manage");
  const { tenantId } = await props.params;
  const tenant = await superAdminDb.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) notFound();

  const [wallet, transactions, byCategory] = await Promise.all([
    getWallet(tenantId),
    superAdminDb.walletTransaction.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 50 }),
    superAdminDb.messageUsage.groupBy({
      by: ["category", "status"],
      where: { tenantId, createdAt: { gte: startOfMonth() } },
      _count: { _all: true },
      _sum: { cost: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/wallets" className="text-sm text-accent-400 hover:underline">← المحافظ</Link>
        <h1 className="mt-2 text-xl font-bold text-white">محفظة {tenant.name}</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs text-slate-400">الرصيد الحالي</p>
          <p className="mt-1 text-3xl font-bold text-white" dir="ltr">{Number(wallet.balance).toFixed(2)} <span className="text-base text-slate-400">SAR</span></p>
        </div>
        <div className="card p-5 sm:col-span-2">
          <p className="mb-2 text-xs text-slate-400">استهلاك هذا الشهر حسب الفئة</p>
          {byCategory.length === 0 ? (
            <p className="text-sm text-slate-500">لا رسائل بعد هذا الشهر.</p>
          ) : (
            <div className="flex flex-wrap gap-3 text-sm">
              {byCategory.map((r) => (
                <span key={`${r.category}-${r.status}`} className="rounded-lg bg-white/5 px-3 py-1.5 text-slate-300">
                  {CATEGORY_LABELS[r.category as MessageCategory] ?? r.category}
                  {r.status === "REFUNDED" ? " (مستردة)" : r.status === "FREE" ? " (مجانية)" : ""}: {r._count._all} · {Number(r._sum.cost ?? 0).toFixed(2)} ر.س
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {canManage && (
        <section className="card space-y-5 p-6">
          <div>
            <h2 className="font-semibold text-white">تعديل الرصيد يدوياً</h2>
            <p className="text-xs text-slate-400">لشحنات التحويل البنكي أو التعويضات — كل تعديل يُسجَّل بهويتك في سجل الحركات وسجل التدقيق.</p>
          </div>
          <AdjustWalletForm tenantId={tenantId} />
          <MinAlertForm tenantId={tenantId} minAlert={Number(wallet.minAlert)} />
        </section>
      )}

      <section className="card overflow-x-auto">
        <h2 className="p-5 pb-0 font-semibold text-white">سجل الحركات (آخر 50)</h2>
        {transactions.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">لا حركات بعد.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-right text-xs text-slate-500">
                <th className="p-3 font-medium">التاريخ</th>
                <th className="p-3 font-medium">النوع</th>
                <th className="p-3 font-medium">المبلغ</th>
                <th className="p-3 font-medium">الرصيد بعدها</th>
                <th className="p-3 font-medium">الوصف</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const type = TX_LABELS[t.type] ?? { label: t.type, className: "text-slate-300" };
                const amount = Number(t.amount);
                return (
                  <tr key={t.id} className="border-b border-white/5">
                    <td className="p-3 text-xs text-slate-500">{t.createdAt.toLocaleString("ar-SA")}</td>
                    <td className={`p-3 ${type.className}`}>{type.label}</td>
                    <td className={`p-3 font-mono ${amount < 0 ? "text-danger-500" : "text-success-500"}`} dir="ltr">{amount > 0 ? "+" : ""}{amount.toFixed(4)}</td>
                    <td className="p-3 font-mono text-slate-300" dir="ltr">{Number(t.balanceAfter).toFixed(4)}</td>
                    <td className="p-3 text-xs text-slate-400">{t.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
