import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { getCountryConfigs } from "@/lib/billing/countryConfig";
import { COUNTRY_LABELS_AR } from "@/lib/currency";
import { updateCountryConfig } from "./actions";

export default async function AdminCountriesPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.settings.manage")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية إدارة إعدادات الدول. هذه الصفحة محصورة بمالك المنصة.
      </div>
    );
  }

  const configs = await getCountryConfigs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">الدول والعملات</h1>
        <p className="text-sm text-slate-400">
          كل دولة تعمل بها المنصة لها عملتها ونسبة ضريبتها الخاصة — تُستخدَم فعلياً في كل فاتورة/اشتراك
          لأي تاجر من تلك الدولة. السعودية هي الدولة الأساسية ولا يمكن إخفاؤها عن نماذج التسجيل.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {configs.map((config) => (
          <form key={config.country} action={updateCountryConfig.bind(null, config.country)} className="card space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">
                {COUNTRY_LABELS_AR[config.country]}
                {config.isDefault && <span className="badge bg-accent-500/10 text-accent-400 mr-2">أساسية</span>}
              </h2>
              <span className="badge bg-white/5 text-slate-300" dir="ltr">{config.currency}</span>
            </div>
            <p className="text-xs text-slate-500">{config.currencyLabel}</p>

            <div>
              <label className="label-field">نسبة ضريبة القيمة المضافة %</label>
              <input
                name="vatRatePercent"
                type="number"
                min={0}
                max={100}
                step={0.1}
                defaultValue={config.vatRateBps / 100}
                className="input-field text-sm"
                dir="ltr"
              />
            </div>

            {config.isDefault ? (
              <p className="text-xs text-slate-500">سعر الصرف: 1 (العملة الأساسية التي تُسعَّر بها كل الباقات).</p>
            ) : (
              <div>
                <label className="label-field">سعر الصرف مقابل الريال السعودي</label>
                <input
                  name="exchangeRateFromSar"
                  type="number"
                  min={0}
                  step={0.0001}
                  defaultValue={config.exchangeRateFromSar}
                  className="input-field text-sm"
                  dir="ltr"
                />
                <p className="mt-1 text-xs text-slate-500">
                  كم وحدة من {config.currency} تعادل 1 ريال سعودي — يُستخدَم لتحويل أسعار الباقات تلقائياً لهذه الدولة.
                </p>
              </div>
            )}

            {config.isDefault ? (
              <p className="text-xs text-slate-500">متاحة دائماً في نماذج التسجيل (الدولة الأساسية).</p>
            ) : (
              <label className="flex items-center gap-1.5 text-xs text-slate-300">
                <input type="checkbox" name="isActive" defaultChecked={config.isActive} />
                متاحة في نماذج التسجيل/الأسعار العامة
              </label>
            )}

            <button type="submit" className="btn-primary w-full text-sm">حفظ</button>
          </form>
        ))}
      </div>
    </div>
  );
}
