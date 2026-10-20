import Link from "next/link";
import { requireTenantSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platformSettings";
import { isMoyasarConfigured } from "@/lib/billing/moyasar";
import { CATEGORY_LABELS, getWallet, isWalletBilled, startOfMonth, type MessageCategory } from "@/lib/billing/wallet";
import { MyMinAlertForm, RechargeForm } from "./WalletForms";

export const metadata = { title: "محفظة الرسائل — DMS Tech" };

const TX_LABELS: Record<string, string> = { RECHARGE: "شحن", DEBIT: "رسالة", REFUND: "استرداد رسالة لم تُرسل", ADJUSTMENT: "تعديل من الإدارة" };
const RECHARGE_NOTICES: Record<string, { text: string; className: string }> = {
  success: { text: "✅ تم الدفع وأُضيف المبلغ لمحفظتك.", className: "border-success-500/30 bg-success-500/10 text-success-500" },
  pending: { text: "⏳ لم يُؤكَّد الدفع بعد — سيُضاف الرصيد تلقائياً فور تأكيد بوابة الدفع.", className: "border-warning-500/30 bg-warning-500/10 text-warning-500" },
  failed: { text: "❌ لم يكتمل الدفع، ولم يُخصم أي مبلغ من المحفظة.", className: "border-danger-500/30 bg-danger-500/10 text-danger-500" },
  cancelled: { text: "أُلغيت عملية الدفع.", className: "border-white/10 bg-white/5 text-slate-300" },
  unknown: { text: "تعذّر التعرف على عملية الدفع — إن خُصم المبلغ سيُضاف تلقائياً، أو تواصل مع الدعم.", className: "border-warning-500/30 bg-warning-500/10 text-warning-500" },
};

export default async function WalletPage(props: { searchParams: Promise<{ recharge?: string }> }) {
  const session = await requireTenantSession();
  if (!hasPermission(session.user.role, "billing.view")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض الفوترة.</div>;
  }
  const canManage = hasPermission(session.user.role, "billing.manage");
  const tenantId = session.user.tenantId;
  const { recharge } = await props.searchParams;

  // جداول المحفظة مستأجَرة (RLS) — القراءة هنا مقيّدة صراحةً بـ tenantId الجلسة.
  const [wallet, billed, settings, transactions, usage, rates] = await Promise.all([
    getWallet(tenantId),
    isWalletBilled(tenantId),
    getPlatformSettings(),
    superAdminDb.walletTransaction.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 30 }),
    superAdminDb.messageUsage.groupBy({ by: ["category", "status"], where: { tenantId, createdAt: { gte: startOfMonth() } }, _count: { _all: true }, _sum: { cost: true } }),
    superAdminDb.messageRate.findMany({ where: { country: { in: ["SA", "*"] } } }),
  ]);
  const balance = Number(wallet.balance);
  const low = balance < Number(wallet.minAlert);
  const markup = settings.walletMarkupBps / 10000;
  const priceFor = (category: string) => {
    const r = rates.find((x) => x.country === "SA" && x.category === category) ?? rates.find((x) => x.country === "*" && x.category === category);
    return r ? Number(r.baseRateSar) * (1 + markup) : null;
  };
  const notice = recharge ? RECHARGE_NOTICES[recharge] : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/billing" className="text-sm text-accent-400 hover:underline">← الفوترة والاشتراك</Link>
        <h1 className="mt-2 text-xl font-bold text-white">محفظة رسائل واتساب</h1>
        <p className="text-sm text-slate-400">رصيد مسبق الدفع لرسائل واتساب الرسمي عبر DMS — يُخصم تلقائياً لكل رسالة قالب، والردود على عملائك مجانية.</p>
      </div>

      {notice && <div className={`rounded-lg border px-4 py-3 text-sm ${notice.className}`}>{notice.text}</div>}
      {!billed && (
        <div className="card border border-accent-500/30 bg-accent-500/5 p-4 text-sm text-slate-300">
          المحفظة تُستخدم مع رقم واتساب الرسمي عبر DMS. <Link href="/dashboard/integrations" className="font-semibold text-accent-400 underline">اربط رقمك من التكاملات</Link> — ويمكنك الشحن مسبقاً الآن.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`card p-6 ${low ? "border border-warning-500/40" : ""}`}>
          <p className="text-xs text-slate-400">الرصيد الحالي</p>
          <p className="mt-1 text-4xl font-bold text-white" dir="ltr">{balance.toFixed(2)} <span className="text-lg text-slate-400">SAR</span></p>
          {low && <p className="mt-2 text-xs text-warning-500">الرصيد أقل من حد التنبيه — رسائل الحملات والقوالب تتوقف عند نفاده.</p>}
        </div>
        <div className="card space-y-4 p-6 lg:col-span-2">
          <h2 className="font-semibold text-white">شحن المحفظة</h2>
          {canManage ? <RechargeForm minRecharge={settings.walletMinRechargeSar} enabled={await isMoyasarConfigured()} /> : <p className="text-sm text-slate-400">الشحن متاح لصاحب الحساب فقط.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card space-y-3 p-6">
          <h2 className="font-semibold text-white">سعر الرسالة (السعودية)</h2>
          <ul className="space-y-2 text-sm">
            {(["MARKETING", "UTILITY", "AUTHENTICATION"] as const).map((c) => {
              const price = priceFor(c);
              return (
                <li key={c} className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-300">رسالة {CATEGORY_LABELS[c]}</span>
                  <span className="font-mono text-white" dir="ltr">{price !== null ? `${price.toFixed(4)} SAR` : "—"}</span>
                </li>
              );
            })}
            <li className="flex justify-between">
              <span className="text-slate-300">رد على عميل داخل 24 ساعة من رسالته</span>
              <span className="font-semibold text-success-500">مجاني</span>
            </li>
          </ul>
        </section>
        <section className="card space-y-3 p-6">
          <h2 className="font-semibold text-white">استهلاك هذا الشهر</h2>
          {usage.length === 0 ? (
            <p className="text-sm text-slate-500">لا رسائل بعد هذا الشهر.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {usage.map((u) => (
                <li key={`${u.category}-${u.status}`} className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-300">
                    {CATEGORY_LABELS[u.category as MessageCategory] ?? u.category}
                    {u.status === "REFUNDED" ? " (مستردة)" : u.status === "FREE" ? " (مجانية)" : ""} — {u._count._all.toLocaleString("ar-SA")} رسالة
                  </span>
                  <span className="font-mono text-white" dir="ltr">{Number(u._sum.cost ?? 0).toFixed(2)} SAR</span>
                </li>
              ))}
            </ul>
          )}
          {canManage && <MyMinAlertForm minAlert={Number(wallet.minAlert)} />}
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="p-5 pb-0 font-semibold text-white">سجل الحركات</h2>
        {transactions.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">لا حركات بعد.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-right text-xs text-slate-500">
                <th className="p-3 font-medium">التاريخ</th>
                <th className="p-3 font-medium">الحركة</th>
                <th className="p-3 font-medium">المبلغ</th>
                <th className="p-3 font-medium">الرصيد بعدها</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const amount = Number(t.amount);
                return (
                  <tr key={t.id} className="border-b border-white/5">
                    <td className="p-3 text-xs text-slate-500">{t.createdAt.toLocaleString("ar-SA")}</td>
                    <td className="p-3 text-slate-300">{TX_LABELS[t.type] ?? t.type}<span className="block text-xs text-slate-500">{t.description}</span></td>
                    <td className={`p-3 font-mono ${amount < 0 ? "text-danger-500" : "text-success-500"}`} dir="ltr">{amount > 0 ? "+" : ""}{amount.toFixed(4)}</td>
                    <td className="p-3 font-mono text-slate-300" dir="ltr">{Number(t.balanceAfter).toFixed(2)}</td>
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
