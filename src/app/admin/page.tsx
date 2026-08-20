import Link from "next/link";
import { superAdminDb } from "@/lib/db";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { TENANT_STATUS_LABELS_AR, TENANT_STATUS_BADGE_CLASS, TENANT_STATUS_BAR_CLASS } from "@/lib/tenantStatus";
import { formatMoney } from "@/lib/currency";
import { computeRevenueSummary, MONTH_LABELS_AR } from "@/lib/admin/revenueAnalytics";
import { BarChart } from "@/components/admin/BarChart";
import { DonutChart } from "@/components/admin/DonutChart";

export default async function AdminOverviewPage() {
  const session = await requireSuperAdminSession();
  const canViewRevenue = hasEffectivePermission(session.user.permissions, "platform.view_revenue");
  const canViewMerchants = hasEffectivePermission(session.user.permissions, "platform.merchants.view");
  const canReviewApprovals = hasEffectivePermission(session.user.permissions, "platform.approvals.review");
  const canViewAuditLog = hasEffectivePermission(session.user.permissions, "platform.audit_log.view");
  const canManageSettings = hasEffectivePermission(session.user.permissions, "platform.settings.manage");
  const canSendAnnouncements = hasEffectivePermission(session.user.permissions, "platform.announcements.send");
  const canViewHealth = hasEffectivePermission(session.user.permissions, "platform.health.view");

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sixMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_LABELS_AR[d.getMonth()] ?? "", date: d };
  });

  const [
    tenantsCount, activeSubs, invoicesPaid, tenantsByStatus, pendingApprovalsCount, recentActivity,
    tenantsCreated6mo, revenueSummary, metaConnectedCount, metaTotalCount, webhookTotal, webhookFailed,
    aiRepliesTodayCount, aiHandoffsTodayCount,
  ] = await Promise.all([
    superAdminDb.tenant.count(),
    superAdminDb.subscription.count({ where: { status: "ACTIVE" } }),
    // مجموع لكل عملة على حدة — لا يُدمَج أبداً في رقم واحد (نفس مبدأ صفحة الإيرادات التفصيلية).
    canViewRevenue ? superAdminDb.invoice.groupBy({ by: ["currency"], where: { status: "PAID" }, _sum: { amountSar: true } }) : null,
    superAdminDb.tenant.groupBy({ by: ["status"], _count: true }),
    superAdminDb.approvalRequest.count({ where: { status: "PENDING" } }),
    canViewAuditLog
      ? superAdminDb.auditLog.findMany({ include: { user: true, tenant: true }, orderBy: { createdAt: "desc" }, take: 8 })
      : [],
    canViewMerchants ? superAdminDb.tenant.findMany({ select: { createdAt: true }, where: { createdAt: { gte: sixMonthsAgoStart } } }) : [],
    canViewRevenue ? computeRevenueSummary() : null,
    canViewHealth ? superAdminDb.integration.count({ where: { provider: "META_WHATSAPP", status: "CONNECTED" } }) : 0,
    canViewHealth ? superAdminDb.integration.count({ where: { provider: "META_WHATSAPP" } }) : 0,
    canViewHealth ? superAdminDb.webhookLog.count() : 0,
    canViewHealth ? superAdminDb.webhookLog.count({ where: { signatureValid: false } }) : 0,
    canViewMerchants ? superAdminDb.aiReplyLog.count({ where: { createdAt: { gte: todayStart } } }) : 0,
    canViewMerchants ? superAdminDb.aiReplyLog.count({ where: { createdAt: { gte: todayStart }, handoffTriggered: true } }) : 0,
  ]);

  const suspendedCount = tenantsByStatus.find((s) => s.status === "SUSPENDED")?._count ?? 0;
  const totalForBar = tenantsByStatus.reduce((sum, s) => sum + s._count, 0) || 1;

  const tenantGrowthCounts = new Map<string, number>(last6Months.map((m) => [m.key, 0]));
  for (const t of tenantsCreated6mo) {
    const key = `${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}`;
    if (tenantGrowthCounts.has(key)) tenantGrowthCounts.set(key, (tenantGrowthCounts.get(key) ?? 0) + 1);
  }
  const tenantGrowthTrend = last6Months.map((m) => ({ label: m.label, amountSar: tenantGrowthCounts.get(m.key) ?? 0 }));

  const planDonutData = revenueSummary?.planDistribution.map((p) => ({ label: p.name, value: p.count })) ?? [];

  const webhookFailureRate = webhookTotal > 0 ? Math.round((webhookFailed / webhookTotal) * 100) : 0;
  const aiHandoffRateToday = aiRepliesTodayCount > 0 ? Math.round((aiHandoffsTodayCount / aiRepliesTodayCount) * 100) : null;

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

      {(canViewMerchants || canViewRevenue) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {canViewMerchants && (
            <div className="card p-5">
              <h2 className="mb-4 font-semibold text-white">نمو التجار — آخر 6 أشهر</h2>
              <BarChart data={tenantGrowthTrend} />
            </div>
          )}
          {canViewRevenue && (
            <div className="card p-5">
              <h2 className="mb-4 font-semibold text-white">توزيع الباقات</h2>
              <DonutChart data={planDonutData} />
            </div>
          )}
        </div>
      )}

      {(canViewHealth || canViewMerchants) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {canViewHealth && (
            <Link href="/admin/health" className="card p-5 transition hover:bg-white/5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-white">صحة المنصة</h2>
                <span className="text-sm text-accent-400 hover:underline">التفاصيل الكاملة ←</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-400">اتصال واتساب</p>
                  <p className="mt-1 font-bold text-white" dir="ltr">{metaConnectedCount} / {metaTotalCount}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">فشل Webhooks</p>
                  <p className={`mt-1 font-bold ${webhookFailureRate > 10 ? "text-danger-500" : "text-white"}`}>{webhookFailureRate}%</p>
                </div>
              </div>
            </Link>
          )}
          {canViewMerchants && (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold text-white">🤖 الموظف الذكي عبر المنصة</h2>
              {aiRepliesTodayCount === 0 ? (
                <p className="text-sm text-slate-500">لا نشاط اليوم.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-400">ردود اليوم عبر كل التجار</p>
                    <p className="mt-1 font-bold text-white" dir="ltr">{aiRepliesTodayCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">نسبة التحويل لموظف بشري</p>
                    <p className="mt-1 font-bold text-warning-500" dir="ltr">{aiHandoffRateToday}%</p>
                  </div>
                </div>
              )}
            </div>
          )}
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
