import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { getEgs, getSellerProfile, invoiceLabel, sellerProfileIssues } from "@/lib/zatca/service";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { OnboardForm, ProcessNowButton, SellerForm } from "./ZatcaForms";
import { retryZatcaDoc } from "./actions";

export const metadata = { title: "الفوترة الإلكترونية ZATCA — DMS Tech" };
export const dynamic = "force-dynamic";

const ENV_LABEL: Record<string, string> = { sandbox: "بيئة المطوّرين", simulation: "المحاكاة", production: "الإنتاج" };
const STATUS_BADGE: Record<string, string> = {
  REPORTED: "bg-success-500/10 text-success-500",
  CLEARED: "bg-success-500/10 text-success-500",
  PENDING: "bg-white/5 text-slate-400",
  FAILED: "bg-warning-500/10 text-warning-500",
  REJECTED: "bg-danger-500/10 text-danger-500",
};
const STATUS_LABEL: Record<string, string> = { REPORTED: "مُبلَّغة", CLEARED: "معتمدة", PENDING: "معلّقة", FAILED: "فشل مؤقت", REJECTED: "مرفوضة" };

export default async function ZatcaPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.settings.manage")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية عرض هذه الصفحة.</div>;
  }
  const [seller, egs, docs, counts] = await Promise.all([
    getSellerProfile(),
    getEgs(),
    superAdminDb.zatcaDocument.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { invoice: { select: { invoiceNumber: true, createdAt: true, amountSar: true, tenant: { select: { name: true } } } } },
    }),
    superAdminDb.zatcaDocument.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const issues = sellerProfileIssues(seller);
  const active = egs?.status === "ACTIVE";
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">🧾 الفوترة الإلكترونية — ZATCA (المرحلة الثانية)</h1>
        <p className="text-sm text-slate-400">
          كل فاتورة اشتراك مدفوعة تُوقَّع رقمياً وتُرسل للهيئة تلقائياً: مبسّطة (إبلاغ) أو قياسية (اعتماد مسبق) للتاجر المسجّل
          ضريبياً، وكل استرداد يُصدر إشعاراً دائناً. رمز QR الموقّع يظهر في PDF الفاتورة.
        </p>
      </div>

      <div className={`card p-4 ${active ? "border border-success-500/30" : "border border-warning-500/30"}`}>
        <p className={`font-semibold ${active ? "text-success-500" : "text-warning-500"}`}>
          {active ? `✅ وحدة الإصدار مفعّلة — ${ENV_LABEL[egs!.environment] ?? egs!.environment}` : "⚠️ وحدة الإصدار غير مسجّلة بعد — الفواتير بالمرحلة الأولى (QR) فقط"}
        </p>
        {active && (
          <p className="mt-1 text-xs text-slate-400">
            {egs!.commonName} · العدّاد ICV: {egs!.icv} · مفعّلة منذ {egs!.activatedAt?.toLocaleString("ar-SA")} · مُبلَّغة {count("REPORTED")} · معتمدة {count("CLEARED")} ·
            مرفوضة {count("REJECTED")} · معلّقة/فاشلة {count("PENDING") + count("FAILED")}
          </p>
        )}
        {egs?.lastError && <p className="mt-1 text-xs text-danger-500">{egs.lastError}</p>}
        {active && <div className="mt-3"><ProcessNowButton /></div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3 p-5">
          <h2 className="font-bold text-white">1) بيانات البائع (المنصة)</h2>
          {issues.length > 0 && <p className="text-xs text-warning-500">ناقص: {issues.join("، ")}</p>}
          <SellerForm values={Object.fromEntries(Object.entries({
            sellerLegalName: seller.name, sellerVatNumber: seller.vatNumber, sellerCrn: seller.crn, sellerStreet: seller.street,
            sellerBuildingNumber: seller.buildingNumber, sellerDistrict: seller.district, sellerCity: seller.city, sellerPostalCode: seller.postalCode,
          }).map(([k, v]) => [k, v ?? ""]))} />
        </section>
        <section className="card space-y-3 p-5">
          <h2 className="font-bold text-white">2) تسجيل وحدة الإصدار (EGS)</h2>
          <p className="text-xs text-slate-400">
            ابدأ ببيئة المطوّرين للتجربة الفورية، ثم المحاكاة، ثم الإنتاج برمز OTP من بوابة فاتورة. إعادة التسجيل تستبدل الشهادة وتبدأ
            سلسلة فواتير جديدة.
          </p>
          <OnboardForm disabled={issues.length > 0} />
        </section>
      </div>

      <section className="card overflow-x-auto p-5">
        <h2 className="mb-3 font-bold text-white">آخر المستندات المرسلة للهيئة</h2>
        {docs.length === 0 ? (
          <p className="text-sm text-slate-500">لا مستندات بعد.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-right text-xs text-slate-500">
                <th className="p-2 font-medium">الفاتورة</th>
                <th className="p-2 font-medium">التاجر</th>
                <th className="p-2 font-medium">النوع</th>
                <th className="p-2 font-medium">الحالة</th>
                <th className="p-2 font-medium">رسائل الهيئة</th>
                <th className="p-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const msgs = (Array.isArray(d.messagesJson) ? d.messagesJson : []) as Array<{ type: string; code: string; message: string }>;
                return (
                  <tr key={d.id} className="border-b border-white/5 align-top">
                    <td className="p-2 font-mono text-xs text-slate-200" dir="ltr">{invoiceLabel(d.invoice)}{d.icv ? ` · ICV ${d.icv}` : ""}</td>
                    <td className="p-2 text-xs text-slate-300">{d.invoice.tenant.name}</td>
                    <td className="p-2 text-xs text-slate-300">{d.docType === "credit" ? "إشعار دائن" : "فاتورة"} · {d.kind === "standard" ? "قياسية" : "مبسّطة"}</td>
                    <td className="p-2"><span className={`badge ${STATUS_BADGE[d.status] ?? ""}`}>{STATUS_LABEL[d.status] ?? d.status}</span></td>
                    <td className="p-2 text-xs">
                      {msgs.slice(0, 3).map((m, i) => (
                        <p key={i} className={m.type === "ERROR" ? "text-danger-500" : "text-warning-500"}>{m.code}: {m.message}</p>
                      ))}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        {d.xml && <a href={`/api/admin/zatca/${d.id}/xml`} className="btn-secondary text-xs">XML</a>}
                        {(d.status === "REJECTED" || d.status === "FAILED") && (
                          <ConfirmSubmitButton action={retryZatcaDoc.bind(null, d.id)} confirmMessage="إعادة إرسال المستند للهيئة؟" className="btn-secondary text-xs">إعادة الإرسال</ConfirmSubmitButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
