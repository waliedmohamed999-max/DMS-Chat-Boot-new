import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { buildAuditLogWhere, type AuditLogSearchParams } from "@/lib/admin/auditLogFilters";
import { Pagination } from "@/components/admin/Pagination";

const PAGE_SIZE = 30;

type SearchParams = AuditLogSearchParams & { page?: string };

export default async function PlatformAuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.audit_log.view")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض سجل التدقيق الشامل. هذه الصفحة محصورة بمالك المنصة.
      </div>
    );
  }

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const where = buildAuditLogWhere(searchParams);

  // سجل تدقيق شامل: إجراءات فريق المنصة (tenantId فارغ) + كل إجراء حساس داخل أي تاجر —
  // مالك المنصة يقدر يراجع كل شيء، وهذا يشمل مراجعة نشاط انتحال الهوية نفسه (شفافية ذاتية).
  const [logs, total, internalStaff, actionOptions] = await Promise.all([
    superAdminDb.auditLog.findMany({
      where,
      include: { user: true, tenant: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    superAdminDb.auditLog.count({ where }),
    superAdminDb.user.findMany({ where: { tenantId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    superAdminDb.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function exportHref(format: "csv") {
    const p = new URLSearchParams();
    if (searchParams.userId) p.set("userId", searchParams.userId);
    if (searchParams.tenantId) p.set("tenantId", searchParams.tenantId);
    if (searchParams.action) p.set("action", searchParams.action);
    if (searchParams.dateFrom) p.set("dateFrom", searchParams.dateFrom);
    if (searchParams.dateTo) p.set("dateTo", searchParams.dateTo);
    p.set("format", format);
    return `/api/admin/audit-log/export?${p.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">سجل التدقيق الشامل</h1>
          <p className="text-sm text-slate-400">كل إجراء حساس على مستوى المنصة أو داخل أي تاجر — بدون استثناء</p>
        </div>
        <a href={exportHref("csv")} className="btn-secondary text-xs">⬇️ تصدير CSV</a>
      </div>

      <form className="flex flex-wrap gap-2">
        <select name="userId" defaultValue={searchParams.userId ?? ""} className="input-field text-sm">
          <option value="">كل الموظفين</option>
          {internalStaff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select name="action" defaultValue={searchParams.action ?? ""} className="input-field text-sm">
          <option value="">كل أنواع الأحداث</option>
          {actionOptions.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}
        </select>
        <input name="tenantId" defaultValue={searchParams.tenantId ?? ""} placeholder="معرّف التاجر المتأثر..." className="input-field text-sm" dir="ltr" />
        <input name="dateFrom" type="date" defaultValue={searchParams.dateFrom ?? ""} className="input-field text-sm" dir="ltr" />
        <input name="dateTo" type="date" defaultValue={searchParams.dateTo ?? ""} className="input-field text-sm" dir="ltr" />
        <button type="submit" className="btn-secondary text-sm">تصفية</button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              <th className="p-3 font-medium">الإجراء</th>
              <th className="p-3 font-medium">بواسطة</th>
              <th className="p-3 font-medium">التاجر</th>
              <th className="p-3 font-medium">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-white/5 last:border-0">
                <td className="p-3 text-slate-200">{log.action}</td>
                <td className="p-3 text-slate-400">{log.user?.name ?? "النظام"}</td>
                <td className="p-3 text-slate-400">{log.tenant?.name ?? "—"}</td>
                <td className="p-3 text-xs text-slate-500">{new Date(log.createdAt).toLocaleString("ar-SA")}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-slate-500">لا يوجد نشاط مطابق للفلاتر المحدَّدة.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        basePath="/admin/audit-log"
        params={{ userId: searchParams.userId, tenantId: searchParams.tenantId, action: searchParams.action, dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo }}
      />
    </div>
  );
}
