import Link from "next/link";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { createContact } from "./actions";
import { ImportContactsForm } from "./ImportContactsForm";
import { ContactsTable } from "./ContactsTable";
import { UndoImportButton } from "./UndoImportButton";
import { buildContactListWhere, type ContactListSearchParams } from "@/lib/contacts/filters";
import { STAGE_LABELS_AR, CONTACT_STAGES_ORDERED } from "@/lib/contacts/stages";

const PAGE_SIZE = 25;
const UNDO_IMPORT_WINDOW_MINUTES = 10;

type Tab = "all" | "campaign" | "import" | "manual" | "store";
const TAB_LABELS: Record<Tab, string> = {
  all: "الكل",
  campaign: "حسب الحملة",
  import: "استيراد ملفات",
  manual: "إضافة يدوية",
  store: "من تكامل المتجر",
};

type SearchParams = ContactListSearchParams & { page?: string };

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;
  const canExport = hasPermission(session.user.role, "contacts.export");
  const canDelete = hasPermission(session.user.role, "contacts.delete");

  const tab: Tab = (["all", "campaign", "import", "manual", "store"] as const).includes(searchParams.tab as Tab)
    ? (searchParams.tab as Tab)
    : "all";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const where = buildContactListWhere(tenantId, { ...searchParams, tab });

  const [
    contacts,
    filteredCount,
    tabCounts,
    tags,
    campaignsWithContacts,
    importBatches,
  ] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.contact.findMany({
        where,
        include: { tags: { include: { tag: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      tx.contact.count({ where }),
      tx.contact.groupBy({ by: ["source"], where: { tenantId }, _count: true }),
      tx.tag.findMany({ where: { tenantId, isSystem: false }, orderBy: { name: "asc" } }),
      tx.campaign.findMany({
        where: { tenantId, sourcedContacts: { some: {} } },
        select: { id: true, name: true, _count: { select: { sourcedContacts: true } } },
        orderBy: { createdAt: "desc" },
      }),
      tab === "import"
        ? tx.contactImportBatch.findMany({
            where: { tenantId, source: "IMPORT" },
            orderBy: { createdAt: "desc" },
            take: 20,
            include: { createdBy: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ])
  );

  const totalCount = tabCounts.reduce((sum, t) => sum + t._count, 0);
  const countsBySource: Record<string, number> = Object.fromEntries(tabCounts.map((t) => [t.source, t._count]));
  const tabCountMap: Record<Tab, number> = {
    all: totalCount,
    campaign: countsBySource.CAMPAIGN_IMPORT ?? 0,
    import: countsBySource.IMPORT ?? 0,
    manual: countsBySource.MANUAL ?? 0,
    store: (countsBySource.ZID_SYNC ?? 0) + (countsBySource.SALLA_SYNC ?? 0),
  };
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));

  function tabHref(t: Tab) {
    const p = new URLSearchParams();
    p.set("tab", t);
    return `/dashboard/contacts?${p.toString()}`;
  }

  function exportHref(format: "xlsx" | "csv") {
    const p = new URLSearchParams();
    p.set("format", format);
    p.set("scope", "filtered");
    p.set("tab", tab);
    if (searchParams.q) p.set("q", searchParams.q);
    if (searchParams.campaignId) p.set("campaignId", searchParams.campaignId);
    if (searchParams.stage) p.set("stage", searchParams.stage);
    if (searchParams.tagId) p.set("tagId", searchParams.tagId);
    if (searchParams.city) p.set("city", searchParams.city);
    if (searchParams.optIn) p.set("optIn", searchParams.optIn);
    if (searchParams.dateFrom) p.set("dateFrom", searchParams.dateFrom);
    if (searchParams.dateTo) p.set("dateTo", searchParams.dateTo);
    return `/api/contacts/export?${p.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">جهات الاتصال</h1>
          <p className="text-sm text-slate-400">{totalCount} جهة اتصال</p>
        </div>
        {canExport && (
          <div className="flex gap-2">
            <a href={exportHref("xlsx")} className="btn-secondary text-xs">⬇️ تصدير Excel</a>
            <a href={exportHref("csv")} className="btn-secondary text-xs">⬇️ تصدير CSV</a>
          </div>
        )}
      </div>

      {/* شريط التبويبات — تقسيم فعلي حسب المصدر */}
      <div className="flex flex-wrap gap-2 border-b border-white/5 pb-3">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              tab === t ? "bg-accent-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {TAB_LABELS[t]} <span className="text-xs opacity-70">({tabCountMap[t]})</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          {/* فلاتر متقدمة */}
          <form className="mb-4 flex flex-wrap gap-2">
            <input type="hidden" name="tab" value={tab} />
            <input
              type="search" name="q" defaultValue={searchParams.q}
              placeholder="بحث بالاسم أو الجوال..." className="input-field flex-1 min-w-[160px] text-sm"
            />
            {tab === "campaign" && campaignsWithContacts.length > 0 && (
              <select name="campaignId" defaultValue={searchParams.campaignId ?? ""} className="input-field text-sm">
                <option value="">كل الحملات</option>
                {campaignsWithContacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c._count.sourcedContacts})</option>
                ))}
              </select>
            )}
            <select name="stage" defaultValue={searchParams.stage ?? ""} className="input-field text-sm">
              <option value="">كل المراحل</option>
              {CONTACT_STAGES_ORDERED.map((s) => <option key={s} value={s}>{STAGE_LABELS_AR[s]}</option>)}
            </select>
            {tags.length > 0 && (
              <select name="tagId" defaultValue={searchParams.tagId ?? ""} className="input-field text-sm">
                <option value="">كل الوسوم</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <input
              name="city" defaultValue={searchParams.city} placeholder="المدينة"
              className="input-field w-28 text-sm"
            />
            <select name="optIn" defaultValue={searchParams.optIn ?? ""} className="input-field text-sm">
              <option value="">كل حالات الموافقة</option>
              <option value="yes">موافق</option>
              <option value="no">غير موافق</option>
              <option value="unset">غير محدد</option>
            </select>
            <input type="date" name="dateFrom" defaultValue={searchParams.dateFrom} className="input-field text-sm" dir="ltr" />
            <input type="date" name="dateTo" defaultValue={searchParams.dateTo} className="input-field text-sm" dir="ltr" />
            <button type="submit" className="btn-secondary text-sm">تصفية</button>
          </form>

          <ContactsTable contacts={contacts} canExport={canExport} canDelete={canDelete} />

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const params = new URLSearchParams();
                params.set("tab", tab);
                params.set("page", String(p));
                if (searchParams.q) params.set("q", searchParams.q);
                if (searchParams.campaignId) params.set("campaignId", searchParams.campaignId);
                if (searchParams.stage) params.set("stage", searchParams.stage);
                if (searchParams.tagId) params.set("tagId", searchParams.tagId);
                if (searchParams.city) params.set("city", searchParams.city);
                if (searchParams.optIn) params.set("optIn", searchParams.optIn);
                if (searchParams.dateFrom) params.set("dateFrom", searchParams.dateFrom);
                if (searchParams.dateTo) params.set("dateTo", searchParams.dateTo);
                return (
                  <Link
                    key={p}
                    href={`/dashboard/contacts?${params.toString()}`}
                    className={`rounded-md px-3 py-1 ${p === page ? "bg-accent-500 text-white" : "text-slate-400 hover:bg-white/5"}`}
                  >
                    {p}
                  </Link>
                );
              })}
            </div>
          )}

          {tab === "import" && importBatches.length > 0 && (
            <div className="mt-6 border-t border-white/5 pt-4">
              <h3 className="mb-3 font-semibold text-white">دفعات الاستيراد الأخيرة</h3>
              <div className="space-y-2">
                {importBatches.map((b) => {
                  const canUndo = (Date.now() - b.createdAt.getTime()) / 60000 <= UNDO_IMPORT_WINDOW_MINUTES;
                  return (
                    <div key={b.id} className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm">
                      <div>
                        <p className="text-slate-200">{b.fileName}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(b.createdAt).toLocaleString("ar-SA")} — {b.importedCount} جديدة، {b.updatedCount} محدَّثة
                          {b.skippedCount > 0 && `، ${b.skippedCount} تم تخطيها`} — بواسطة {b.createdBy.name}
                        </p>
                      </div>
                      {canUndo && <UndoImportButton batchId={b.id} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 lg:col-span-1">
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-semibold text-white">إضافة جهة اتصال</h2>
            <form action={createContact} className="space-y-3">
              <div>
                <label className="label-field">الاسم</label>
                <input name="name" required className="input-field" placeholder="اسم العميل" />
              </div>
              <div>
                <label className="label-field">الجوال (صيغة دولية)</label>
                <input name="phoneE164" required className="input-field" placeholder="+966501234567" dir="ltr" />
              </div>
              <div>
                <label className="label-field">البريد الإلكتروني (اختياري)</label>
                <input name="email" type="email" className="input-field" placeholder="email@example.com" dir="ltr" />
              </div>
              <div>
                <label className="label-field">المدينة (اختياري)</label>
                <input name="city" className="input-field" placeholder="الرياض" />
              </div>
              <button type="submit" className="btn-primary w-full">إضافة</button>
            </form>
          </div>

          <div className="card p-5">
            <ImportContactsForm />
          </div>
        </div>
      </div>
    </div>
  );
}
