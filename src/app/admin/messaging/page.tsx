import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platformSettings";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { deleteMessageRate } from "./actions";
import { RateForm, WalletSettingsForm } from "./MessagingForms";

export const metadata = { title: "تسعير الرسائل — DMS Tech" };

const CATEGORY_LABELS: Record<string, string> = { MARKETING: "تسويقية", UTILITY: "خدمية", AUTHENTICATION: "مصادقة" };

export default async function AdminMessagingPricingPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.billing.manage")) {
    return <div className="card p-8 text-center text-slate-400">ليس لديك صلاحية إدارة تسعير الرسائل. هذه الصفحة محصورة بمالك المنصة.</div>;
  }

  const [settings, rates] = await Promise.all([
    getPlatformSettings(),
    superAdminDb.messageRate.findMany({ orderBy: [{ country: "asc" }, { category: "asc" }] }),
  ]);
  const markup = settings.walletMarkupBps / 10000;
  const missingSa = (["MARKETING", "UTILITY", "AUTHENTICATION"] as const).filter((c) => !rates.some((r) => (r.country === "SA" || r.country === "*") && r.category === c));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">تسعير رسائل واتساب (المحفظة)</h1>
        <p className="text-sm text-slate-400">
          سعر Meta لكل رسالة حسب الدولة والفئة + هامش المنصة = ما يُخصم من محفظة التاجر. رسائل الرد داخل نافذة خدمة العميل
          (24 ساعة) مجانية ولا تحتاج سعراً.
        </p>
      </div>

      {missingSa.length > 0 && (
        <div className="card border border-warning-500/30 bg-warning-500/5 p-4 text-sm text-warning-500">
          ⚠️ لا يوجد سعر للسعودية (ولا سعر افتراضي *) لفئة: {missingSa.map((c) => CATEGORY_LABELS[c]).join("، ")} — رسائل هذه الفئة
          ستُرفض عبر قناة 360dialog حتى يُضبط سعرها. خذ الأسعار من{" "}
          <a href="https://developers.facebook.com/docs/whatsapp/pricing" target="_blank" rel="noopener noreferrer" className="underline">بطاقة أسعار Meta الرسمية</a>.
        </div>
      )}

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold text-white">الهامش والحد الأدنى للشحن</h2>
        <WalletSettingsForm markupPercent={settings.walletMarkupBps / 100} minRechargeSar={settings.walletMinRechargeSar} />
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold text-white">أسعار Meta لكل رسالة</h2>
        <RateForm />
        {rates.length === 0 ? (
          <p className="text-sm text-slate-500">لا أسعار مضبوطة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-right text-xs text-slate-500">
                  <th className="p-3 font-medium">الدولة</th>
                  <th className="p-3 font-medium">الفئة</th>
                  <th className="p-3 font-medium">سعر Meta</th>
                  <th className="p-3 font-medium">السعر على التاجر (+{(markup * 100).toFixed(2)}%)</th>
                  <th className="p-3 font-medium">آخر تحديث</th>
                  <th className="p-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => {
                  const base = Number(r.baseRateSar);
                  return (
                    <tr key={r.id} className="border-b border-white/5">
                      <td className="p-3 font-mono text-slate-200">{r.country === "*" ? "* (افتراضي)" : r.country}</td>
                      <td className="p-3 text-slate-300">{CATEGORY_LABELS[r.category] ?? r.category}</td>
                      <td className="p-3 text-slate-300" dir="ltr">{base.toFixed(4)} SAR</td>
                      <td className="p-3 font-semibold text-white" dir="ltr">{(base * (1 + markup)).toFixed(4)} SAR</td>
                      <td className="p-3 text-xs text-slate-500">{r.updatedAt.toLocaleDateString("ar-SA")}</td>
                      <td className="p-3 text-left">
                        <ConfirmSubmitButton action={deleteMessageRate.bind(null, r.id)} confirmMessage="حذف هذا السعر؟ رسائل هذه الفئة لهذه الدولة ستُرفض حتى يُضبط سعر جديد." className="btn-danger text-xs">
                          حذف
                        </ConfirmSubmitButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
