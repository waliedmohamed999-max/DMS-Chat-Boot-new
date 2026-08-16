import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { computeRevenueSummary } from "@/lib/admin/revenueAnalytics";
import { buildInvoiceWhere, type InvoiceSearchParams } from "@/lib/admin/invoiceFilters";
import { DonutChart } from "@/components/admin/DonutChart";
import { BarChart } from "@/components/admin/BarChart";
import { Pagination } from "@/components/admin/Pagination";
import { BillingTabs } from "./BillingTabs";
import { RetryPaymentButton } from "./RetryPaymentButton";
import { RefundButton } from "./RefundButton";

const PAGE_SIZE = 20;

const INVOICE_STATUS_LABELS_AR: Record<string, string> = {
  PAID: "مدفوعة", PENDING: "قيد الانتظار", FAILED: "فشلت", REFUNDED: "مستردة", CANCELLED: "ملغاة", OVERDUE: "متأخرة",
};
const INVOICE_STATUS_BADGE: Record<string, string> = {
  PAID: "bg-success-500/10 text-success-500", PENDING: "bg-warning-500/10 text-warning-500", FAILED: "bg-danger-500/10 text-danger-500",
  REFUNDED: "bg-slate-500/10 text-slate-400", CANCELLED: "bg-slate-500/10 text-slate-400", OVERDUE: "bg-danger-500/10 text-danger-500",
};

type SearchParams = InvoiceSearchParams & { page?: string };

export default async function PlatformBillingPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSuperAdminSession();
  if (!hasPermission(session.user.role, "platform.view_revenue")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض الإيرادات والفواتير. هذه الصفحة محصورة بمالك المنصة والفريق المالي.
      </div>
    );
  }
  const canViewMerchantDetail = hasPermission(session.user.role, "platform.merchants.view");
  const canRefund = hasPermission(session.user.role, "platform.view_revenue");

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const where = buildInvoiceWhere(searchParams);

  const [summary, invoicesPaidTotal, invoicesFailed, invoices, invoiceTotal, plans] = await Promise.all([
    computeRevenueSummary(),
    superAdminDb.invoice.aggregate({ where: { status: "PAID" }, _sum: { amountSar: true } }),
    superAdminDb.invoice.findMany({ where: { status: "FAILED" }, include: { tenant: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    superAdminDb.invoice.findMany({
      where, include: { tenant: { include: { paymentMethod: true } } },
      orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    }),
    superAdminDb.invoice.count({ where }),
    superAdminDb.plan.findMany({ where: { isCustomForTenantId: null }, orderBy: { priceMonthlySar: "asc" }, select: { key: true, name: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(invoiceTotal / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">الإيرادات والفوترة</h1>
        <p className="text-sm text-slate-400">نظرة مالية شاملة عبر كل التجار</p>
      </div>

      <BillingTabs active="overview" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="card p-4">
          <p className="text-xs text-slate-400">MRR (إيراد شهري متكرر)</p>
          <p className="mt-1 font-bold text-white" dir="ltr">{summary.mrrSar.toLocaleString()} ر.س</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">ARR (إيراد سنوي متكرر)</p>
          <p className="mt-1 font-bold text-white" dir="ltr">{summary.arrSar.toLocaleString()} ر.س</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">تسرّب الإيراد (Churn) هذا الشهر</p>
          <p className="mt-1 font-bold text-warning-500" dir="ltr">{summary.churnPercent}%</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">إجمالي المحصَّل تاريخياً</p>
          <p className="mt-1 font-bold text-success-500" dir="ltr">{(invoicesPaidTotal._sum.amountSar ?? 0).toLocaleString()} ر.س</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">تجديدات خلال 7 أيام</p>
          <p className="mt-1 font-bold text-white">{summary.renewals7d}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">تجديدات خلال 30 يوماً</p>
          <p className="mt-1 font-bold text-white">{summary.renewals30d}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-white">اتجاه الإيراد المفوتَر — آخر 12 شهراً</h2>
          <BarChart data={summary.mrrTrend} />
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-white">توزيع الاشتراكات النشطة حسب الباقة</h2>
          <DonutChart data={summary.planDistribution.map((p) => ({ label: p.name, value: p.count }))} />
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-white">مدفوعات فاشلة</h2>
        <div className="space-y-2">
          {invoicesFailed.length === 0 && (
            <p className="text-sm text-slate-500">لا توجد مدفوعات فاشلة حالياً.</p>
          )}
          {invoicesFailed.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger-500/20 bg-danger-500/5 p-3 text-sm">
              <div>
                <span className="text-slate-300">{inv.tenant.name}</span>
                <span className="mr-2 text-danger-500">— {inv.failureReason ?? "سبب غير محدد"}</span>
              </div>
              <RetryPaymentButton invoiceId={inv.id} />
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/5 p-4">
          <h2 className="mb-3 font-semibold text-white">الفواتير</h2>
          <form className="flex flex-wrap gap-2">
            <select name="status" defaultValue={searchParams.status ?? ""} className="input-field text-sm">
              <option value="">كل الحالات</option>
              {Object.entries(INVOICE_STATUS_LABELS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select name="planKey" defaultValue={searchParams.planKey ?? ""} className="input-field text-sm">
              <option value="">كل الباقات</option>
              {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
            <input name="tenantId" defaultValue={searchParams.tenantId ?? ""} placeholder="معرّف التاجر..." className="input-field text-sm" dir="ltr" />
            <input name="dateFrom" type="date" defaultValue={searchParams.dateFrom ?? ""} className="input-field text-sm" dir="ltr" />
            <input name="dateTo" type="date" defaultValue={searchParams.dateTo ?? ""} className="input-field text-sm" dir="ltr" />
            <button type="submit" className="btn-secondary text-sm">تصفية</button>
          </form>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              <th className="p-3 font-medium">#</th>
              <th className="p-3 font-medium">التاجر</th>
              <th className="p-3 font-medium">المبلغ</th>
              <th className="p-3 font-medium">طريقة الدفع</th>
              <th className="p-3 font-medium">الحالة</th>
              <th className="p-3 font-medium">التاريخ</th>
              <th className="p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-white/5 last:border-0">
                <td className="p-3 text-slate-500" dir="ltr">INV-{inv.createdAt.getFullYear()}-{String(inv.invoiceNumber).padStart(5, "0")}</td>
                <td className="p-3 text-slate-300">
                  {canViewMerchantDetail ? (
                    <Link href={`/admin/tenants/${inv.tenantId}`} className="hover:text-accent-400">{inv.tenant.name}</Link>
                  ) : (
                    inv.tenant.name
                  )}
                </td>
                <td className="p-3 text-slate-100" dir="ltr">{inv.amountSar} ر.س <span className="text-slate-500">(ض.ق.م {inv.vatAmountSar})</span></td>
                <td className="p-3 text-xs text-slate-400" dir="ltr">
                  {inv.tenant.paymentMethod ? `${inv.tenant.paymentMethod.brand} •••• ${inv.tenant.paymentMethod.last4}` : "—"}
                </td>
                <td className="p-3">
                  <span className={`badge ${INVOICE_STATUS_BADGE[inv.status] ?? "bg-slate-500/10 text-slate-400"}`}>
                    {INVOICE_STATUS_LABELS_AR[inv.status] ?? inv.status}
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-500">{new Date(inv.createdAt).toLocaleDateString("ar-SA")}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <a href={`/api/admin/billing/invoices/${inv.id}/pdf`} className="text-xs text-accent-400 hover:underline">PDF</a>
                    {canRefund && inv.status === "PAID" && <RefundButton invoiceId={inv.id} />}
                  </div>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-500">لا توجد فواتير مطابقة للفلاتر المحدَّدة.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        basePath="/admin/billing"
        params={{ status: searchParams.status, planKey: searchParams.planKey, tenantId: searchParams.tenantId, dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo }}
      />
    </div>
  );
}
