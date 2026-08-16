import { requireSuperAdminSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { ensureChartOfAccounts } from "@/lib/accounting/chartOfAccounts";
import { computeAllAccountBalances } from "@/lib/accounting/balances";
import { BillingTabs } from "../BillingTabs";
import { AddAccountForm } from "./AddAccountForm";

type AccountNode = {
  id: string; code: string; name: string; type: string; isSystemAccount: boolean;
  balance: number; children: AccountNode[];
};

export default async function ChartOfAccountsPage() {
  const session = await requireSuperAdminSession();
  if (!hasPermission(session.user.role, "platform.view_revenue")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض دليل الحسابات. هذه الصفحة محصورة بمالك المنصة والفريق المالي.
      </div>
    );
  }

  await ensureChartOfAccounts();

  const [accounts, balances] = await Promise.all([
    superAdminDb.account.findMany({ orderBy: { code: "asc" } }),
    computeAllAccountBalances(),
  ]);

  const byId = new Map<string, AccountNode>(
    accounts.map((a) => [a.id, { id: a.id, code: a.code, name: a.name, type: a.type, isSystemAccount: a.isSystemAccount, balance: balances.get(a.id) ?? 0, children: [] }])
  );
  const roots: AccountNode[] = [];
  for (const a of accounts) {
    const node = byId.get(a.id)!;
    if (a.parentId && byId.has(a.parentId)) byId.get(a.parentId)!.children.push(node);
    else roots.push(node);
  }

  function renderRow(node: AccountNode, depth: number) {
    return (
      <div className="flex items-center justify-between py-1.5" style={{ paddingRight: `${depth * 20}px` }}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500" dir="ltr">{node.code}</span>
          <span className="text-sm text-slate-200">{node.name}</span>
          {!node.isSystemAccount && <span className="badge bg-accent-500/10 text-accent-400 text-[10px]">مخصَّص</span>}
        </div>
        <span className="text-sm font-medium text-slate-100" dir="ltr">{node.balance.toLocaleString()} ر.س</span>
      </div>
    );
  }

  // شجرة قابلة للطي/التوسيع فعلياً عبر <details>/<summary> الأصلية في المتصفح — بلا أي جافاسكريبت
  // عميل إضافي (بند 4-أ: "شجرة حسابات قابلة للطي والتوسيع").
  function renderNode(node: AccountNode, depth: number) {
    if (node.children.length === 0) {
      return <div key={node.id} className="border-b border-white/5">{renderRow(node, depth)}</div>;
    }
    return (
      <details key={node.id} open className="border-b border-white/5">
        <summary className="cursor-pointer list-none">{renderRow(node, depth)}</summary>
        {node.children.map((c) => renderNode(c, depth + 1))}
      </details>
    );
  }

  const rootParentOptions = roots.map((r) => ({ code: r.code, name: r.name }));
  // فروع من المستوى الثاني أيضاً متاحة كأب للحساب الجديد (مثال: إضافة تحت "5" مباشرة أو تحت "5.1")
  const secondLevelOptions = roots.flatMap((r) => r.children.map((c) => ({ code: c.code, name: `${r.name} ← ${c.name}` })));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">دليل الحسابات</h1>
          <p className="text-sm text-slate-400">شجرة الحسابات الكاملة مع رصيد فعلي محسوب من دفتر القيود لكل حساب</p>
        </div>
        <a href="/api/admin/billing/accounts/export" className="btn-secondary text-xs">⬇️ تصدير للمحاسب (CSV)</a>
      </div>

      <BillingTabs active="accounts" />

      <div className="card p-5">
        {roots.map((r) => renderNode(r, 0))}
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-white">إضافة حساب فرعي جديد</h2>
        <AddAccountForm parentOptions={[...rootParentOptions, ...secondLevelOptions]} />
      </div>
    </div>
  );
}
