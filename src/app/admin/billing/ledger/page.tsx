import { requireSuperAdminSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { buildJournalWhere, type LedgerSearchParams } from "@/lib/admin/ledgerFilters";
import { Pagination } from "@/components/admin/Pagination";
import { BillingTabs } from "../BillingTabs";

const PAGE_SIZE = 30;

const SOURCE_TYPE_LABELS_AR: Record<string, string> = {
  invoice_payment: "تحصيل فاتورة",
  revenue_recognition: "اعتراف بإيراد مؤجَّل",
  invoice_refund: "استرداد فاتورة",
};

type SearchParams = LedgerSearchParams & { page?: string };

export default async function LedgerPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSuperAdminSession();
  if (!hasPermission(session.user.role, "platform.view_revenue")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض دفتر القيود. هذه الصفحة محصورة بمالك المنصة والفريق المالي.
      </div>
    );
  }

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const where = buildJournalWhere(searchParams);

  const [entries, total] = await Promise.all([
    superAdminDb.journalEntry.findMany({
      where,
      include: { lines: { include: { debitAccount: true, creditAccount: true } } },
      orderBy: { entryDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    superAdminDb.journalEntry.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function exportHref() {
    const p = new URLSearchParams();
    if (searchParams.sourceType) p.set("sourceType", searchParams.sourceType);
    if (searchParams.dateFrom) p.set("dateFrom", searchParams.dateFrom);
    if (searchParams.dateTo) p.set("dateTo", searchParams.dateTo);
    return `/api/admin/billing/ledger/export?${p.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">دفتر القيود (اليومية العامة)</h1>
          <p className="text-sm text-slate-400">كل حدث مالي — فاتورة صادرة/مدفوعة، استرداد، تجديد — يُنشئ قيداً محاسبياً متوازناً هنا تلقائياً</p>
        </div>
        <a href={exportHref()} className="btn-secondary text-xs">⬇️ تصدير للمحاسب (CSV)</a>
      </div>

      <BillingTabs active="ledger" />

      <form className="flex flex-wrap gap-2">
        <select name="sourceType" defaultValue={searchParams.sourceType ?? ""} className="input-field text-sm">
          <option value="">كل أنواع الأحداث</option>
          {Object.entries(SOURCE_TYPE_LABELS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input name="dateFrom" type="date" defaultValue={searchParams.dateFrom ?? ""} className="input-field text-sm" dir="ltr" />
        <input name="dateTo" type="date" defaultValue={searchParams.dateTo ?? ""} className="input-field text-sm" dir="ltr" />
        <button type="submit" className="btn-secondary text-sm">تصفية</button>
      </form>

      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-4 py-2 text-xs">
              <span className="text-slate-300">{entry.description}</span>
              <span className="text-slate-500">
                {SOURCE_TYPE_LABELS_AR[entry.sourceType] ?? entry.sourceType} · {new Date(entry.entryDate).toLocaleString("ar-SA")}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-xs text-slate-500">
                  <th className="p-2 font-medium">الحساب</th>
                  <th className="p-2 font-medium">مدين</th>
                  <th className="p-2 font-medium">دائن</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line) => (
                  <tr key={line.id} className="border-t border-white/5">
                    <td className="p-2 text-slate-300">{line.debitAccount?.name ?? line.creditAccount?.name}</td>
                    <td className="p-2 text-slate-100" dir="ltr">{line.debitAccountId ? line.amountSar.toLocaleString() : ""}</td>
                    <td className="p-2 text-slate-100" dir="ltr">{line.creditAccountId ? line.amountSar.toLocaleString() : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="card p-8 text-center text-slate-500">لا توجد قيود مطابقة للفلاتر المحدَّدة.</div>
        )}
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        basePath="/admin/billing/ledger"
        params={{ sourceType: searchParams.sourceType, dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo }}
      />
    </div>
  );
}
