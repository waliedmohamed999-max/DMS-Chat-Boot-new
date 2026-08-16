import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { TENANT_STATUS_LABELS_AR, TENANT_STATUS_BADGE_CLASS } from "@/lib/tenantStatus";
import { buildTenantListWhere, type TenantListSearchParams } from "@/lib/admin/tenantFilters";
import { CORE_PROVIDERS, computeCompleteness, computeHealthLevel } from "@/lib/integrationHealth";
import { Pagination } from "@/components/admin/Pagination";
import { TenantRowActions } from "./TenantRowActions";
import { CreateTenantButton } from "./CreateTenantButton";

const PAGE_SIZE = 20;
const HEALTH_ICON: Record<string, string> = { green: "🟢", yellow: "🟡", red: "🔴" };
const ALL_STATUSES = ["PENDING_REVIEW", "TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED", "REJECTED"] as const;

type SortKey = "name" | "createdAt" | "lastActivity";
type SearchParams = TenantListSearchParams & { page?: string; sort?: SortKey; dir?: "asc" | "desc"; prefillLead?: string };

export default async function TenantsListPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSuperAdminSession();
  if (!hasPermission(session.user.role, "platform.merchants.view")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية عرض قائمة التجار التفصيلية. هذه الصفحة محصورة بفريق الدعم الفني ومالك المنصة.
      </div>
    );
  }
  const canSuspend = hasPermission(session.user.role, "platform.merchants.suspend");
  const canReview = hasPermission(session.user.role, "platform.approvals.review");
  const canImpersonate = hasPermission(session.user.role, "platform.merchants.impersonate");

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const sort: SortKey = (["name", "createdAt", "lastActivity"] as const).includes(searchParams.sort as SortKey) ? (searchParams.sort as SortKey) : "createdAt";
  const dir = searchParams.dir === "asc" ? "asc" : "desc";

  const where = await buildTenantListWhere(searchParams);
  const plans = await superAdminDb.plan.findMany({ where: { isCustomForTenantId: null }, orderBy: { priceMonthlySar: "asc" } });

  // "تحويل إلى تاجر جديد" من صفحة رسائل التواصل (بند و في برومنت التدقيق) — يصل هنا بمعرّف الرسالة
  // فقط، فتُجلَب بياناتها لتعبئة نموذج الإنشاء اليدوي مسبقاً بدل إعادة كتابتها يدوياً من الصفر.
  const prefillLead = searchParams.prefillLead
    ? await superAdminDb.contactMessage.findUnique({ where: { id: searchParams.prefillLead } })
    : null;

  let tenants: Awaited<ReturnType<typeof fetchPage>>;
  let total: number;

  if (sort === "lastActivity") {
    // الترتيب حسب "آخر نشاط" يحتاج تجميعاً عبر علاقة User — لا يمكن فعله بـorderBy مباشر في Prisma،
    // فيُحسَب عبر: (1) كل المعرّفات المطابقة للفلتر، (2) آخر دخول لكل تينانت عبر groupBy، (3) ترتيب
    // في الذاكرة على المعرّفات فقط (خفيف — إسقاط id فقط، وليس الصفوف الكاملة)، (4) تقطيع الصفحة، ثم
    // جلب الصفوف الكاملة للتقطيع فقط.
    const allIds = await superAdminDb.tenant.findMany({ where, select: { id: true } });
    const idList = allIds.map((t) => t.id);
    total = idList.length;
    const lastLogins = await superAdminDb.user.groupBy({ by: ["tenantId"], where: { tenantId: { in: idList } }, _max: { lastLoginAt: true } });
    const lastLoginByTenant = new Map(lastLogins.map((l) => [l.tenantId, l._max.lastLoginAt?.getTime() ?? 0]));
    idList.sort((a, b) => {
      const diff = (lastLoginByTenant.get(a) ?? 0) - (lastLoginByTenant.get(b) ?? 0);
      return dir === "asc" ? diff : -diff;
    });
    const pageIds = idList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const rows = await fetchByIds(pageIds);
    // fetchByIds لا يحافظ على ترتيب pageIds (Prisma `in` لا يضمن الترتيب) — أعد الترتيب يدوياً.
    const rowsById = new Map(rows.map((r) => [r.id, r]));
    tenants = pageIds.map((id) => rowsById.get(id)!).filter(Boolean);
  } else {
    [tenants, total] = await Promise.all([
      fetchPage(where, sort, dir, page),
      superAdminDb.tenant.count({ where }),
    ]);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const lastLogins = await superAdminDb.user.groupBy({
    by: ["tenantId"], where: { tenantId: { in: tenants.map((t) => t.id) } }, _max: { lastLoginAt: true },
  });
  const lastLoginByTenant = new Map(lastLogins.map((l) => [l.tenantId, l._max.lastLoginAt]));

  function sortHref(key: SortKey) {
    const p = new URLSearchParams();
    if (searchParams.q) p.set("q", searchParams.q);
    if (searchParams.status) p.set("status", searchParams.status);
    if (searchParams.planId) p.set("planId", searchParams.planId);
    if (searchParams.health) p.set("health", searchParams.health);
    p.set("sort", key);
    p.set("dir", sort === key && dir === "desc" ? "asc" : "desc");
    return `/admin/tenants?${p.toString()}`;
  }

  function exportHref(format: "xlsx" | "csv") {
    const p = new URLSearchParams();
    if (searchParams.q) p.set("q", searchParams.q);
    if (searchParams.status) p.set("status", searchParams.status);
    if (searchParams.planId) p.set("planId", searchParams.planId);
    if (searchParams.health) p.set("health", searchParams.health);
    p.set("format", format);
    return `/api/admin/tenants/export?${p.toString()}`;
  }

  const sortArrow = (key: SortKey) => (sort === key ? (dir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">التجار المشتركون</h1>
        <div className="flex gap-2">
          {canReview && (
            <CreateTenantButton
              plans={plans}
              prefill={
                prefillLead
                  ? { leadId: prefillLead.id, storeName: prefillLead.name, ownerName: prefillLead.name, ownerEmail: prefillLead.email, ownerPhone: prefillLead.phone }
                  : null
              }
            />
          )}
          <a href={exportHref("xlsx")} className="btn-secondary text-xs">⬇️ تصدير Excel</a>
          <a href={exportHref("csv")} className="btn-secondary text-xs">⬇️ تصدير CSV</a>
        </div>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={searchParams.q} placeholder="بحث بالاسم، المعرّف، بريد المالك، أو رقم واتساب..." className="input-field flex-1 min-w-[220px] text-sm" />
        <select name="status" defaultValue={searchParams.status ?? ""} className="input-field text-sm">
          <option value="">كل الحالات</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{TENANT_STATUS_LABELS_AR[s]}</option>)}
        </select>
        <select name="planId" defaultValue={searchParams.planId ?? ""} className="input-field text-sm">
          <option value="">كل الباقات</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="health" defaultValue={searchParams.health ?? ""} className="input-field text-sm">
          <option value="">كل حالات التكامل</option>
          <option value="full">اكتمال كامل</option>
          <option value="partial">اكتمال جزئي</option>
          <option value="none">بدون تكامل</option>
        </select>
        <button type="submit" className="btn-secondary text-sm">تصفية</button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              <th className="p-4 font-medium"><Link href={sortHref("name")} className="hover:text-slate-300">المتجر{sortArrow("name")}</Link></th>
              <th className="p-4 font-medium">الباقة</th>
              <th className="p-4 font-medium">صحة التكاملات</th>
              <th className="p-4 font-medium"><Link href={sortHref("lastActivity")} className="hover:text-slate-300">آخر نشاط{sortArrow("lastActivity")}</Link></th>
              <th className="p-4 font-medium"><Link href={sortHref("createdAt")} className="hover:text-slate-300">تاريخ الانضمام{sortArrow("createdAt")}</Link></th>
              <th className="p-4 font-medium">الحالة</th>
              <th className="p-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => {
              const coreStatuses = t.integrations.filter((i) => CORE_PROVIDERS.includes(i.provider));
              const connectedCount = coreStatuses.filter((i) => i.status === "CONNECTED").length;
              const completeness = computeCompleteness(connectedCount);
              const health = computeHealthLevel(coreStatuses.map((i) => i.status), completeness);
              const lastActivity = lastLoginByTenant.get(t.id);

              return (
                <tr key={t.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                  <td className="p-4">
                    <Link href={`/admin/tenants/${t.id}`} className="font-medium text-slate-100 hover:text-accent-400">{t.name}</Link>
                    <p className="text-xs text-slate-500">{t.slug}</p>
                  </td>
                  <td className="p-4 text-slate-300">{t.subscription?.plan.name ?? "—"}</td>
                  <td className="p-4 text-slate-300">
                    <span title={`${connectedCount} / ${CORE_PROVIDERS.length} متصل`}>{HEALTH_ICON[health]}</span>
                    <span className="mr-1" dir="ltr">{connectedCount}/{CORE_PROVIDERS.length}</span>
                  </td>
                  <td className="p-4 text-xs text-slate-400">{lastActivity ? new Date(lastActivity).toLocaleDateString("ar-SA") : "لم يسجّل دخول بعد"}</td>
                  <td className="p-4 text-xs text-slate-500">{t.createdAt.toLocaleDateString("ar-SA")}</td>
                  <td className="p-4">
                    <span className={`badge ${TENANT_STATUS_BADGE_CLASS[t.status] ?? "bg-slate-500/10 text-slate-400"}`}>
                      {TENANT_STATUS_LABELS_AR[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className="p-4 text-left">
                    <TenantRowActions tenantId={t.id} tenantName={t.name} status={t.status} canSuspend={canSuspend} canReview={canReview} canImpersonate={canImpersonate} />
                  </td>
                </tr>
              );
            })}
            {tenants.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-500">لا توجد نتائج مطابقة.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        basePath="/admin/tenants"
        params={{ q: searchParams.q, status: searchParams.status, planId: searchParams.planId, health: searchParams.health, sort, dir }}
      />
    </div>
  );
}

function fetchPage(where: Awaited<ReturnType<typeof buildTenantListWhere>>, sort: SortKey, dir: "asc" | "desc", page: number) {
  return superAdminDb.tenant.findMany({
    where,
    include: { subscription: { include: { plan: true } }, integrations: true },
    orderBy: sort === "name" ? { name: dir } : { createdAt: dir },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
}

function fetchByIds(ids: string[]) {
  return superAdminDb.tenant.findMany({
    where: { id: { in: ids } },
    include: { subscription: { include: { plan: true } }, integrations: true },
  });
}
