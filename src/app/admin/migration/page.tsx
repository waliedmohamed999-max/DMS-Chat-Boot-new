import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { listMigrationRows, MIGRATION_STATUS_LABELS } from "@/lib/integrations/migration";
import { isD360Configured } from "@/lib/integrations/d360/client";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { cancelInvite } from "./actions";
import { FinalizeButton, InviteForm } from "./MigrationForms";

const INVITE_FORM_ID = "migration-invite-form";

export const metadata = { title: "نقل التجار إلى 360dialog — DMS Tech" };

const BADGE: Record<string, string> = {
  NOT_INVITED: "bg-white/5 text-slate-400",
  INVITED: "bg-accent-500/10 text-accent-400",
  D360_CONNECTED: "bg-warning-500/10 text-warning-500",
  COMPLETED: "bg-success-500/10 text-success-500",
  CANCELLED: "bg-white/5 text-slate-500",
};

export default async function AdminMigrationPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.merchants.view")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض هذه الصفحة.</div>;
  }
  const canManage = hasEffectivePermission(session.user.permissions, "platform.manage_tenants");
  const rows = await listMigrationRows();
  const statusOf = (r: (typeof rows)[number]) => r.state?.status ?? "NOT_INVITED";
  const count = (s: string) => rows.filter((r) => statusOf(r) === s).length;
  const ratings = rows.map((r) => r.state?.feedback?.rating).filter((x): x is number => typeof x === "number");
  const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "—";

  const stats = [
    { label: "على Meta المباشر", value: rows.filter((r) => r.metaStatus !== "DISCONNECTED").length },
    { label: "مدعوون", value: count("INVITED") },
    { label: "بانتظار الإنهاء", value: count("D360_CONNECTED") },
    { label: "اكتمل نقلهم", value: count("COMPLETED") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">نقل التجار إلى 360dialog</h1>
        <p className="text-sm text-slate-400">
          نقل تدريجي للتجار المربوطين بـ Meta مباشرة: ادعُ دفعة صغيرة، تابع ربطهم عبر 360dialog، ثم أنهِ النقل بفصل الربط القديم.
          ربط Meta يبقى يعمل حتى الإنهاء، والإرسال ينتقل تلقائياً لـ 360dialog (والفوترة للمحفظة) فور ربطه.
        </p>
      </div>

      {!isD360Configured() && (
        <div className="card border border-warning-500/30 p-4 text-sm text-warning-500">
          حساب شريك 360dialog غير مضبوط بعد — التاجر المدعو لن يستطيع إكمال الربط. اضبطه أولاً من{" "}
          <Link href="/admin/setup" className="underline">جاهزية الربط</Link>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{s.value.toLocaleString("ar-SA")}</p>
          </div>
        ))}
        <div className="card p-4">
          <p className="text-xs text-slate-400">تقييم تجربة النقل</p>
          <p className="mt-1 text-2xl font-bold text-white">{avg} <span className="text-xs text-slate-500">({ratings.length})</span></p>
        </div>
      </div>

      <div className="card space-y-3 overflow-x-auto p-4">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">لا تجار على ربط Meta المباشر — لا شيء للنقل.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-right text-xs text-slate-500">
                  {canManage && <th className="p-2 font-medium"></th>}
                  <th className="p-2 font-medium">التاجر</th>
                  <th className="p-2 font-medium">الرقم</th>
                  <th className="p-2 font-medium">حالة النقل</th>
                  <th className="p-2 font-medium">360dialog</th>
                  <th className="p-2 font-medium">التقييم</th>
                  {canManage && <th className="p-2 font-medium"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = statusOf(r);
                  const invitable = r.metaStatus !== "DISCONNECTED" && (s === "NOT_INVITED" || s === "CANCELLED");
                  return (
                    <tr key={r.tenantId} className="border-b border-white/5 align-top">
                      {canManage && (
                        <td className="p-2">
                          {invitable && <input type="checkbox" form={INVITE_FORM_ID} name="tenantId" value={r.tenantId} aria-label={`دعوة ${r.tenantName}`} className="h-4 w-4" />}
                        </td>
                      )}
                      <td className="p-2"><Link href={`/admin/tenants/${r.tenantId}`} className="font-medium text-white hover:underline">{r.tenantName}</Link></td>
                      <td className="p-2 font-mono text-slate-200" dir="ltr">{r.phone ?? "—"}</td>
                      <td className="p-2">
                        <span className={`badge ${BADGE[s]}`}>{MIGRATION_STATUS_LABELS[s]}</span>
                        {r.state?.invitedAt && <p className="mt-1 text-xs text-slate-500">دُعي {new Date(r.state.invitedAt).toLocaleDateString("ar-SA")}</p>}
                        {r.state?.completedAt && <p className="mt-1 text-xs text-slate-500">اكتمل {new Date(r.state.completedAt).toLocaleDateString("ar-SA")}</p>}
                      </td>
                      <td className="p-2 text-xs">
                        {!r.d360 ? (
                          <span className="text-slate-500">غير مربوط</span>
                        ) : r.d360.ready ? (
                          <span className="text-success-500">جاهز ✓</span>
                        ) : (
                          <span className="text-warning-500">{r.d360.status === "CONNECTED" ? "قيد التفعيل" : r.d360.status}</span>
                        )}
                      </td>
                      <td className="p-2 text-xs text-slate-300">
                        {r.state?.feedback ? (
                          <>
                            <span className="text-warning-500">{"★".repeat(r.state.feedback.rating)}{"☆".repeat(5 - r.state.feedback.rating)}</span>
                            {r.state.feedback.comment && <p className="mt-1 max-w-xs text-slate-400">{r.state.feedback.comment}</p>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      {canManage && (
                        <td className="p-2">
                          <div className="flex flex-wrap justify-end gap-2">
                            {s === "INVITED" && (
                              <ConfirmSubmitButton action={cancelInvite.bind(null, r.tenantId)} confirmMessage={`إلغاء دعوة ${r.tenantName}؟`} className="btn-secondary text-xs">
                                إلغاء الدعوة
                              </ConfirmSubmitButton>
                            )}
                            {r.d360?.ready && s !== "COMPLETED" && <FinalizeButton tenantId={r.tenantId} tenantName={r.tenantName} />}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {canManage && <InviteForm formId={INVITE_FORM_ID} />}
          </>
        )}
      </div>

      <div className="card space-y-2 p-4 text-sm text-slate-300">
        <h2 className="font-bold text-white">خطوات النقل من جهة التاجر</h2>
        <ol className="list-decimal space-y-1 pr-5 text-slate-400">
          <li>يعطّل التحقق بخطوتين (PIN) للرقم من WhatsApp Manager في Meta — شرط لنقل الرقم بين المزوّدين.</li>
          <li>يضغط &quot;ربط رقم واتساب&quot; في صفحة التكاملات ويختار نفس الرقم في صفحة 360dialog.</li>
          <li>يشحن محفظة الرسائل (رسائل القوالب والحملات تُخصم منها بعد النقل؛ الردود داخل نافذة 24 ساعة مجانية).</li>
          <li>بعد جاهزية القناة: &quot;إنهاء النقل&quot; (منه أو من هنا) يفصل ربط Meta القديم.</li>
        </ol>
        <p className="text-xs text-slate-500">ملاحظة: القوالب المعتمدة مرتبطة بحساب WABA — إن نُقل الرقم إلى حساب WABA جديد فقد يحتاج التاجر إعادة إرسال قوالبه للاعتماد.</p>
      </div>
    </div>
  );
}
