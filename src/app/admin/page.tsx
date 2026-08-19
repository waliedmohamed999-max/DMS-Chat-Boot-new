import Link from "next/link";
import { superAdminDb } from "@/lib/db";
import { requireSuperAdminSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { TENANT_STATUS_LABELS_AR, TENANT_STATUS_BADGE_CLASS, TENANT_STATUS_BAR_CLASS } from "@/lib/tenantStatus";
import { formatMoney } from "@/lib/currency";

export default async function AdminOverviewPage() {
  const session = await requireSuperAdminSession();
  const canViewRevenue = hasPermission(session.user.role, "platform.view_revenue");
  const canViewMerchants = hasPermission(session.user.role, "platform.merchants.view");
  const canReviewApprovals = hasPermission(session.user.role, "platform.approvals.review");
  const canViewAuditLog = hasPermission(session.user.role, "platform.audit_log.view");
  const canManageSettings = hasPermission(session.user.role, "platform.settings.manage");
  const canSendAnnouncements = hasPermission(session.user.role, "platform.announcements.send");

  const [tenantsCount, activeSubs, invoicesPaid, tenantsByStatus, pendingApprovalsCount, recentActivity] = await Promise.all([
    superAdminDb.tenant.count(),
    superAdminDb.subscription.count({ where: { status: "ACTIVE" } }),
    // مجموع لكل عملة على حدة — لا يُدمَج أبداً في رقم واحد (نفس مبدأ صفحة الإيرادات التفصيلية).
    canViewRevenue ? superAdminDb.invoice.groupBy({ by: ["currency"], where: { status: "PAID" }, _sum: { amountSar: true } }) : null,
    superAdminDb.tenant.groupBy({ by: ["status"], _count: true }),
    superAdminDb.approvalRequest.count({ where: { status: "PENDING" } }),
    canViewAuditLog
      ? superAdminDb.auditLog.findMany({ include: { user: true, tenant: true }, orderBy: { createdAt: "desc" }, take: 8 })
      : [],
  ]);

  const suspendedCount = tenantsByStatus.find((s) => s.status === "SUSPENDED")?._count ?? 0;
  const totalForBar = tenantsByStatus.reduce((sum, s) => sum + s._count, 0) || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">نظرة عامة على المنصة</h1>
        <p className="text-sm text-slate-400">مركز القيادة — مؤشرات حية عبر كل التجار المشتركين</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-sm text-slate-400">إجمالي التجار</p>
          <p className="mt-2 text-2xl font-bold text-white">{tenantsCount}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-slate-400">اشتراكات نشطة</p>
          <p className="mt-2 text-2xl font-bold text-success-500">{activeSubs}</p>
        </div>
        {canViewRevenue && (
          <div className="card p-5">
            <p className="text-sm text-slate-400">إجمالي الإيرادات المحصّلة</p>
            {(invoicesPaid && invoicesPaid.length > 0 ? invoicesPaid : [{ currency: "SAR", _sum: { amountSar: 0 } }]).map((row) => (
              <p key={row.currency} className="mt-2 text-2xl font-bold text-accent-400" dir="ltr">{formatMoney(row._sum.amountSar ?? 0, row.currency)}</p>
            ))}
          </div>
        )}
        {canReviewApprovals ? (
          <Link href="/admin/approvals" className="card p-5 transition hover:bg-white/5">
            <p className="text-sm text-slate-400">طلبات بانتظار المراجعة</p>
            <p className={`mt-2 text-2xl font-bold ${pendingApprovalsCount > 0 ? "text-warning-500" : "text-white"}`}>
              {pendingApprovalsCount}
            </p>
            {pendingApprovalsCount > 0 && <p className="mt-1 text-xs text-warning-500">راجعها الآن ←</p>}
          </Link>
        ) : (
          <div className="card p-5">
            <p className="text-sm text-slate-400">طلبات بانتظار المراجعة</p>
            <p className="mt-2 text-2xl font-bold text-warning-500">{pendingApprovalsCount}</p>
          </div>
        )}
        {canViewMerchants && (
          <Link href="/admin/tenants" className="card p-5 transition hover:bg-white/5">
            <p className="text-sm text-slate-400">تجار معلّقون</p>
            <p className={`mt-2 text-2xl font-bold ${suspendedCount > 0 ? "text-danger-500" : "text-white"}`}>{suspendedCount}</p>
          </Link>
        )}
      </div>

      {(canReviewApprovals || canViewMerchants || canManageSettings || canSendAnnouncements) && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-white">إجراءات سريعة</h2>
          <div className="flex flex-wrap gap-2">
            {canReviewApprovals && (
              <Link href="/admin/approvals" className="btn-secondary text-sm">✅ مركز الموافقات</Link>
            )}
            {canViewMerchants && (
              <Link href="/admin/tenants" className="btn-secondary text-sm">🏬 إدارة التجار</Link>
            )}
            {canSendAnnouncements && (
              <Link href="/admin/announcements" className="btn-secondary text-sm">📢 إرسال إعلان جديد</Link>
            )}
            {canManageSettings && (
              <Link href="/admin/settings" className="btn-secondary text-sm">🛠️ إعدادات المنصة العامة</Link>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-white">توزيع حالة التجار</h2>
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-navy-900">
            {tenantsByStatus.map((s) => (
              <div
                key={s.status}
                className={TENANT_STATUS_BAR_CLASS[s.status] ?? "bg-slate-500"}
                style={{ width: `${(s._count / totalForBar) * 100}%` }}
                title={`${TENANT_STATUS_LABELS_AR[s.status] ?? s.status}: ${s._count}`}
              />
            ))}
          </div>
          <div className="space-y-2">
            {tenantsByStatus.map((s) => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <span className={`badge ${TENANT_STATUS_BADGE_CLASS[s.status] ?? "bg-slate-500/10 text-slate-400"}`}>
                  {TENANT_STATUS_LABELS_AR[s.status] ?? s.status}
                </span>
                <span className="font-medium text-slate-100">{s._count}</span>
              </div>
            ))}
            {tenantsByStatus.length === 0 && <p className="text-sm text-slate-500">لا يوجد تجار بعد.</p>}
          </div>
        </div>

        {canViewAuditLog && (
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-white">أحدث النشاط</h2>
              <Link href="/admin/audit-log" className="text-sm text-accent-400 hover:underline">عرض الكل ←</Link>
            </div>
            <div className="space-y-2">
              {recentActivity.length === 0 && <p className="text-sm text-slate-500">لا يوجد نشاط مسجَّل بعد.</p>}
              {recentActivity.map((log) => (
                <div key={log.id} className="flex items-center justify-between border-b border-white/5 py-2 text-sm last:border-0">
                  <div>
                    <p className="text-slate-200">{log.action}</p>
                    <p className="text-xs text-slate-500">
                      {log.user?.name ?? "النظام"}
                      {log.tenant && ` · ${log.tenant.name}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{new Date(log.createdAt).toLocaleString("ar-SA")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
