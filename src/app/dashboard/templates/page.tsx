import Link from "next/link";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { resubmitTemplateRedirect, deleteSupersededTemplate } from "./actions";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "مسودة", className: "bg-slate-500/10 text-slate-400" },
  PENDING: { label: "بانتظار موافقة Meta", className: "bg-warning-500/10 text-warning-500" },
  APPROVED: { label: "معتمد", className: "bg-success-500/10 text-success-500" },
  REJECTED: { label: "مرفوض", className: "bg-danger-500/10 text-danger-500" },
  PAUSED: { label: "معلَّق (جودة منخفضة)", className: "bg-warning-500/10 text-warning-500" },
  DISABLED: { label: "مُعطَّل نهائياً", className: "bg-danger-500/10 text-danger-500" },
};

const CATEGORY_LABELS_AR: Record<string, string> = {
  MARKETING: "ترويجي",
  UTILITY: "خدمي",
  AUTHENTICATION: "توثيق",
};

export default async function TemplatesPage() {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;
  const canManage = hasEffectivePermission(session.user.permissions, "campaigns.manage");

  if (!canManage) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية إدارة قوالب الرسائل. هذا المسار محصور بصاحب الحساب والمدير.</div>;
  }

  const templates = await withTenant(tenantId, (tx) =>
    tx.messageTemplate.findMany({
      where: { tenantId },
      include: { _count: { select: { campaigns: true } } },
      orderBy: { createdAt: "desc" },
    })
  );

  const decided = templates.filter((t) => t.status === "APPROVED" || t.status === "REJECTED");
  const rejectionRate = decided.length > 0 ? Math.round((decided.filter((t) => t.status === "REJECTED").length / decided.length) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">قوالب الرسائل</h1>
          <p className="text-sm text-slate-400">
            كل قالب جديد يُرسَل فعلياً لمراجعة Meta، وتتحدث حالته تلقائياً عبر webhook دون أي تدخل يدوي.
          </p>
        </div>
        {canManage && (
          <Link href="/dashboard/templates/new" className="btn-primary">
            + قالب جديد
          </Link>
        )}
      </div>

      {rejectionRate !== null && (
        <div className="card p-4 text-sm text-slate-300">
          معدل الرفض التاريخي لقوالبك: <span className={rejectionRate > 30 ? "text-danger-500" : "text-success-500"}>{rejectionRate}%</span>{" "}
          <span className="text-xs text-slate-500">({decided.length} قالب صدر بشأنه قرار)</span>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              <th className="p-4 font-medium">الاسم</th>
              <th className="p-4 font-medium">النوع</th>
              <th className="p-4 font-medium">الحالة</th>
              <th className="p-4 font-medium">الاستخدام</th>
              <th className="p-4 font-medium">التواريخ</th>
              <th className="p-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const status = STATUS_LABELS[t.status]!;
              const canResubmit = t.status === "REJECTED" || t.status === "PAUSED" || t.status === "DISABLED";
              return (
                <tr key={t.id} className="border-b border-white/5 last:border-0">
                  <td className="p-4">
                    <p className="font-medium text-slate-100" dir="ltr">{t.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{t.bodyText}</p>
                    {(t.status === "REJECTED" || t.status === "PAUSED") && t.rejectionReason && (
                      <p className="mt-1 text-xs text-danger-500">
                        {t.status === "PAUSED" ? "سبب التعليق" : "سبب الرفض"}: {t.rejectionReason}
                      </p>
                    )}
                  </td>
                  <td className="p-4 text-slate-400">{CATEGORY_LABELS_AR[t.category] ?? t.category}</td>
                  <td className="p-4">
                    <span className={`badge ${status.className}`}>{status.label}</span>
                  </td>
                  <td className="p-4 text-slate-400">{t._count.campaigns} حملة</td>
                  <td className="p-4 text-xs text-slate-500">
                    <p>أُنشئ: {new Date(t.createdAt).toLocaleDateString("ar-SA")}</p>
                    {t.submittedAt && <p>أُرسل: {new Date(t.submittedAt).toLocaleDateString("ar-SA")}</p>}
                    {t.decidedAt && <p>القرار: {new Date(t.decidedAt).toLocaleDateString("ar-SA")}</p>}
                  </td>
                  <td className="p-4 text-left">
                    {canManage && canResubmit && (
                      <div className="flex justify-end gap-2">
                        <form action={resubmitTemplateRedirect.bind(null, t.id)}>
                          <button className="text-xs text-accent-400 hover:underline">تعديل وإعادة إرسال</button>
                        </form>
                        <form action={deleteSupersededTemplate.bind(null, t.id)}>
                          <button className="text-xs text-danger-500 hover:underline">حذف</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {templates.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">لا توجد قوالب بعد.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
