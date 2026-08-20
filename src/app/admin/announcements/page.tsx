import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { createAnnouncement } from "./actions";

export default async function AnnouncementsPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.announcements.send")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية إرسال إعلانات للتجار. هذه الصفحة محصورة بمالك المنصة.
      </div>
    );
  }

  const [announcements, plans] = await Promise.all([
    superAdminDb.platformAnnouncement.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { dismissals: true } }),
    superAdminDb.plan.findMany({ where: { isActive: true, isCustomForTenantId: null } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">إعلانات المنصة</h1>
        <p className="text-sm text-slate-400">
          إشعارات داخل لوحة التاجر (in-app) — لا يوجد مزود بريد إلكتروني مربوط حالياً، لذا الإرسال
          هنا فوري داخل المنصة فقط.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-white">الإعلانات السابقة</h2>
          <div className="space-y-2">
            {announcements.length === 0 && <p className="text-sm text-slate-500">لا توجد إعلانات بعد.</p>}
            {announcements.map((a) => (
              <div key={a.id} className="rounded-lg border border-white/5 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-100">{a.title}</p>
                  <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleDateString("ar-SA")}</span>
                </div>
                <p className="mt-1 text-slate-400">{a.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  الجمهور: {a.audienceType === "ALL" ? "كل التجار" : a.audienceType === "SPECIFIC_PLAN" ? "باقة محددة" : "تجار محددون"}
                  {" · "}شوهد/تم الإغلاق من {a.dismissals.length} تاجر
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-white">إعلان جديد</h2>
          <form action={createAnnouncement} className="space-y-3">
            <div>
              <label className="label-field">العنوان</label>
              <input name="title" required className="input-field" placeholder="مثال: صيانة مجدولة" />
            </div>
            <div>
              <label className="label-field">النص</label>
              <textarea name="body" required rows={3} className="input-field" />
            </div>
            <div>
              <label className="label-field">الجمهور</label>
              <select name="audienceType" className="input-field">
                <option value="ALL">كل التجار</option>
                <option value="SPECIFIC_PLAN">تجار باقة محددة</option>
                <option value="SPECIFIC_TENANTS">تجار محددون (بالمعرّف)</option>
              </select>
            </div>
            <div>
              <label className="label-field">باقة محددة (إن اُخترت)</label>
              <select name="audiencePlanId" className="input-field">
                <option value="">—</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field">معرّفات تجار محددة (مفصولة بفاصلة)</label>
              <input name="tenantSlugs" className="input-field" placeholder="tenant-a, tenant-b" dir="ltr" />
            </div>
            <button type="submit" className="btn-primary w-full">إرسال الإعلان</button>
          </form>
        </div>
      </div>
    </div>
  );
}
