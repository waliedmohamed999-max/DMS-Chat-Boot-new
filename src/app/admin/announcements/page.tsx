import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { resolveAudienceTenantIds, countTenantsPerPlan } from "@/lib/announcements/audience";
import { SEVERITY_LABELS_AR, SEVERITY_ICON, SEVERITY_BANNER_CLASSES } from "@/lib/announcements/severity";
import { saveAnnouncement, updateAnnouncement, deleteAnnouncement, duplicateAnnouncement } from "./actions";
import type { AnnouncementStatus } from "@prisma/client";

const STATUS_LABELS_AR: Record<AnnouncementStatus, string> = { DRAFT: "مسودة", SCHEDULED: "مجدوَل", SENT: "مُرسَل", EXPIRED: "منتهي" };
const STATUS_BADGE: Record<AnnouncementStatus, string> = {
  DRAFT: "bg-white/5 text-slate-400",
  SCHEDULED: "bg-warning-500/10 text-warning-500",
  SENT: "bg-success-500/10 text-success-500",
  EXPIRED: "bg-white/5 text-slate-500",
};
const NOT_VIEWED_PREVIEW_LIMIT = 20;

function toDatetimeLocalValue(d: Date | null): string {
  if (!d) return "";
  // datetime-local يتوقع "YYYY-MM-DDTHH:mm" بتوقيت المتصفح المحلي — Date.toISOString() يرجع UTC،
  // فنبني السلسلة يدوياً من مكوّنات التوقيت المحلي بدل قص سلسلة UTC (كان سيُنتج وقتاً خاطئاً لأي
  // منطقة زمنية غير UTC).
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function AnnouncementsPage({ searchParams }: { searchParams: { edit?: string } }) {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.announcements.send")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية إرسال إعلانات للتجار. هذه الصفحة محصورة بمالك المنصة.
      </div>
    );
  }

  const [announcements, plans, planCounts, totalTenants] = await Promise.all([
    superAdminDb.platformAnnouncement.findMany({
      orderBy: { createdAt: "desc" }, take: 20,
      include: { dismissals: true, views: true },
    }),
    superAdminDb.plan.findMany({ where: { isActive: true, isCustomForTenantId: null } }),
    countTenantsPerPlan(),
    superAdminDb.tenant.count(),
  ]);

  // وضع التعديل: فقط لو الإعلان لسه DRAFT أو SCHEDULED (نفس القيد المفروض خادمياً في updateAnnouncement
  // نفسها — هنا فقط لتحديد شكل الفورم، وليس مصدر الحماية الفعلي).
  const editTarget = searchParams.edit
    ? announcements.find((a) => a.id === searchParams.edit && (a.status === "DRAFT" || a.status === "SCHEDULED"))
    : undefined;

  // تحليلات كل إعلان مُرسَل/منتهٍ — يُحسَب هنا (خادمياً، مرة واحدة) بدل داخل JSX لتفادي async داخل .map.
  const analyticsById = new Map<
    string,
    { audienceSize: number; viewRate: number; notViewedTenants: { name: string }[]; notViewedRemaining: number }
  >();
  for (const a of announcements) {
    if (a.status !== "SENT" && a.status !== "EXPIRED") continue;
    const audienceIds = await resolveAudienceTenantIds(a.audienceType, a.audiencePlanId, a.audienceTenantIdsJson);
    const audienceSize = audienceIds.length;
    const viewRate = audienceSize > 0 ? (a.views.length / audienceSize) * 100 : 0;

    let notViewedTenants: { name: string }[] = [];
    let notViewedRemaining = 0;
    if (a.status === "SENT") {
      const viewedIds = new Set(a.views.map((v) => v.tenantId));
      const notViewedIds = audienceIds.filter((id) => !viewedIds.has(id));
      if (notViewedIds.length > 0) {
        notViewedTenants = await superAdminDb.tenant.findMany({
          where: { id: { in: notViewedIds.slice(0, NOT_VIEWED_PREVIEW_LIMIT) } },
          select: { name: true },
        });
        notViewedRemaining = Math.max(0, notViewedIds.length - NOT_VIEWED_PREVIEW_LIMIT);
      }
    }
    analyticsById.set(a.id, { audienceSize, viewRate, notViewedTenants, notViewedRemaining });
  }

  const formAction = editTarget ? updateAnnouncement.bind(null, editTarget.id) : saveAnnouncement;

  // audienceTenantIdsJson يخزّن معرّفات (id) وليس slugs (تُحوَّل عند الإنشاء عبر resolveTenantIdsFromSlugs)
  // — نعيد تحويلها لـslugs هنا فقط لملء حقل التعديل بنفس الصيغة التي يتوقعها المستخدم عند إعادة الإدخال.
  let editTenantSlugs = "";
  if (editTarget?.audienceType === "SPECIFIC_TENANTS" && Array.isArray(editTarget.audienceTenantIdsJson)) {
    const ids = editTarget.audienceTenantIdsJson as string[];
    const tenants = await superAdminDb.tenant.findMany({ where: { id: { in: ids } }, select: { slug: true } });
    editTenantSlugs = tenants.map((t) => t.slug).join(", ");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">إعلانات المنصة</h1>
        <p className="text-sm text-slate-400">
          إشعارات داخل لوحة التاجر (in-app) — لا يوجد مزود بريد إلكتروني مربوط حالياً، لذا الإرسال
          هنا فوري أو مجدوَل داخل المنصة فقط.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-white">الإعلانات السابقة</h2>
          <div className="space-y-3">
            {announcements.length === 0 && <p className="text-sm text-slate-500">لا توجد إعلانات بعد.</p>}
            {announcements.map((a) => {
              const analytics = analyticsById.get(a.id);
              const canEdit = a.status === "DRAFT" || a.status === "SCHEDULED";
              return (
                <div key={a.id} className="rounded-lg border border-white/5 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${STATUS_BADGE[a.status]}`}>{STATUS_LABELS_AR[a.status]}</span>
                      <span className={`badge border ${SEVERITY_BANNER_CLASSES[a.severity]}`}>
                        {SEVERITY_ICON[a.severity]} {SEVERITY_LABELS_AR[a.severity]}
                      </span>
                      {!a.dismissible && <span className="badge bg-danger-500/10 text-danger-500">غير قابل للإغلاق</span>}
                    </div>
                    <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleDateString("ar-SA")}</span>
                  </div>

                  <p className="mt-2 font-medium text-slate-100">{a.title}</p>
                  <p className="mt-1 text-slate-400">{a.body}</p>

                  <p className="mt-2 text-xs text-slate-500">
                    الجمهور: {a.audienceType === "ALL" ? "كل التجار" : a.audienceType === "SPECIFIC_PLAN" ? "باقة محددة" : "تجار محددون"}
                    {a.status === "SCHEDULED" && a.scheduledFor && <> · مجدوَل لـ{new Date(a.scheduledFor).toLocaleString("ar-SA")}</>}
                    {a.expiresAt && <> · ينتهي {new Date(a.expiresAt).toLocaleString("ar-SA")}</>}
                  </p>

                  {analytics && (
                    <p className="mt-1 text-xs text-slate-500">
                      شوهد من {a.views.length} من أصل {analytics.audienceSize} تاجر ({analytics.viewRate.toFixed(0)}%)
                      {" · "}أُغلق من {a.dismissals.length} تاجر
                    </p>
                  )}

                  {a.status === "SENT" && analytics && analytics.notViewedTenants.length > 0 && (
                    <details className="mt-2 text-xs text-slate-400">
                      <summary className="cursor-pointer text-slate-300 hover:text-white">
                        مين لسه ما شافش؟ ({analytics.audienceSize - a.views.length})
                      </summary>
                      <ul className="mt-1.5 space-y-0.5 ps-4">
                        {analytics.notViewedTenants.map((t, i) => <li key={i}>{t.name}</li>)}
                        {analytics.notViewedRemaining > 0 && <li className="text-slate-500">+{analytics.notViewedRemaining} أكتر</li>}
                      </ul>
                    </details>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {canEdit && (
                      <a href={`/admin/announcements?edit=${a.id}`} className="badge bg-accent-500/10 text-accent-400">تعديل</a>
                    )}
                    <form action={duplicateAnnouncement.bind(null, a.id)}>
                      <button className="badge bg-white/5 text-slate-300">تكرار</button>
                    </form>
                    <form action={deleteAnnouncement.bind(null, a.id)}>
                      <button className="badge bg-danger-500/10 text-danger-500">حذف</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-white">{editTarget ? "تعديل إعلان" : "إعلان جديد"}</h2>
          {searchParams.edit && !editTarget && (
            <p className="mb-3 rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-xs text-warning-500">
              هذا الإعلان تم إرساله بالفعل ولا يمكن تعديله — عرض نموذج إنشاء جديد بدلاً من ذلك.
            </p>
          )}
          <form action={formAction} className="space-y-3">
            <div>
              <label className="label-field">العنوان</label>
              <input name="title" required defaultValue={editTarget?.title ?? ""} className="input-field" placeholder="مثال: صيانة مجدولة" />
            </div>
            <div>
              <label className="label-field">النص</label>
              <textarea name="body" required rows={3} defaultValue={editTarget?.body ?? ""} className="input-field" />
            </div>
            <div>
              <label className="label-field">الشدة</label>
              <select name="severity" defaultValue={editTarget?.severity ?? "INFO"} className="input-field">
                {Object.entries(SEVERITY_LABELS_AR).map(([key, label]) => (
                  <option key={key} value={key}>{SEVERITY_ICON[key]} {label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" name="dismissible" defaultChecked={editTarget?.dismissible ?? true} className="h-4 w-4" />
              قابل للإغلاق من التاجر
            </label>
            <div>
              <label className="label-field">الجمهور</label>
              <select name="audienceType" defaultValue={editTarget?.audienceType ?? "ALL"} className="input-field">
                <option value="ALL">كل التجار ({totalTenants} تاجر)</option>
                <option value="SPECIFIC_PLAN">تجار باقة محددة</option>
                <option value="SPECIFIC_TENANTS">تجار محددون (بالمعرّف)</option>
              </select>
            </div>
            <div>
              <label className="label-field">باقة محددة (إن اُختيرت)</label>
              <select name="audiencePlanId" defaultValue={editTarget?.audiencePlanId ?? ""} className="input-field">
                <option value="">—</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({planCounts.get(p.id) ?? 0} تاجر)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">معرّفات تجار محددة (مفصولة بفاصلة)</label>
              <input name="tenantSlugs" className="input-field" placeholder="tenant-a, tenant-b" dir="ltr" defaultValue={editTenantSlugs} />
            </div>
            <div>
              <label className="label-field">جدولة الإرسال (اختياري — بتوقيت جهازك)</label>
              <input type="datetime-local" name="scheduledFor" defaultValue={toDatetimeLocalValue(editTarget?.scheduledFor ?? null)} className="input-field" />
            </div>
            <div>
              <label className="label-field">تاريخ الانتهاء (اختياري — بتوقيت جهازك)</label>
              <input type="datetime-local" name="expiresAt" defaultValue={toDatetimeLocalValue(editTarget?.expiresAt ?? null)} className="input-field" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" name="intent" value="draft" className="btn-secondary flex-1">حفظ كمسودة</button>
              <button type="submit" name="intent" value="publish" className="btn-primary flex-1">حفظ وجدولة/إرسال</button>
            </div>
            {editTarget && (
              <a href="/admin/announcements" className="block text-center text-xs text-slate-500 hover:text-slate-300">إلغاء التعديل</a>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
