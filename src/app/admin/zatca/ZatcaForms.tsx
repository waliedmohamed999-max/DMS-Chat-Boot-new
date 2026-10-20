"use client";

import { useActionState, useState, useTransition } from "react";
import { onboardZatca, processZatcaNow, saveSellerProfile, type ActionResult } from "./actions";

function Result({ state }: { state: ActionResult }) {
  return state ? <span className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</span> : null;
}

const SELLER_FIELDS = [
  { name: "sellerLegalName", label: "الاسم القانوني للمنشأة", dir: "rtl" },
  { name: "sellerVatNumber", label: "الرقم الضريبي (15 رقماً)", dir: "ltr" },
  { name: "sellerCrn", label: "السجل التجاري (10 أرقام)", dir: "ltr" },
  { name: "sellerStreet", label: "الشارع", dir: "rtl" },
  { name: "sellerBuildingNumber", label: "رقم المبنى (4 أرقام)", dir: "ltr" },
  { name: "sellerDistrict", label: "الحي", dir: "rtl" },
  { name: "sellerCity", label: "المدينة", dir: "rtl" },
  { name: "sellerPostalCode", label: "الرمز البريدي (5 أرقام)", dir: "ltr" },
] as const;

/** بيانات البائع — مضبوطة الحالة فلا تُفقد عند خطأ التحقق. */
export function SellerForm({ values }: { values: Record<string, string> }) {
  const [state, action, pending] = useActionState(saveSellerProfile, null);
  const [v, setV] = useState(values);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {SELLER_FIELDS.map((f) => (
          <label key={f.name} className="block text-sm text-slate-300">
            {f.label}
            <input name={f.name} value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} className="input-field mt-1" dir={f.dir} required />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary text-sm disabled:opacity-50">{pending ? "جارٍ الحفظ…" : "حفظ بيانات البائع"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function OnboardForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState(onboardZatca, null);
  const [env, setEnv] = useState("sandbox");
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm text-slate-300">
          البيئة
          <select name="environment" value={env} onChange={(e) => setEnv(e.target.value)} className="input-field mt-1">
            <option value="sandbox">بيئة المطوّرين (اختبار فوري — OTP: 123345)</option>
            <option value="simulation">المحاكاة (Fatoora Simulation)</option>
            <option value="production">الإنتاج (Fatoora)</option>
          </select>
        </label>
        <label className="block text-sm text-slate-300">
          رمز OTP
          <input name="otp" required inputMode="numeric" pattern="\d{6}" className="input-field mt-1" dir="ltr" placeholder={env === "sandbox" ? "123345" : "من بوابة فاتورة"} />
          {env !== "sandbox" && <span className="mt-1 block text-xs text-slate-500">fatoora.zatca.gov.sa ← تسجيل وحدة جديدة ← توليد OTP (صالح ساعة)</span>}
        </label>
        <label className="block text-sm text-slate-300">
          اسم وحدة الإصدار (إنجليزي)
          <input name="commonName" required defaultValue="DMS-EGS-1" className="input-field mt-1" dir="ltr" />
        </label>
        <label className="block text-sm text-slate-300">
          الفرع
          <input name="organizationUnit" required defaultValue="Riyadh Branch" className="input-field mt-1" dir="ltr" />
        </label>
        <label className="block text-sm text-slate-300 md:col-span-2">
          النشاط التجاري
          <input name="businessCategory" required defaultValue="Software as a Service" className="input-field mt-1" dir="ltr" />
        </label>
        <label className="block text-sm text-slate-300 md:col-span-2">
          كلمة مرورك (للتأكيد)
          <input name="confirmPassword" type="password" required autoComplete="current-password" className="input-field mt-1" dir="ltr" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending || disabled} className="btn-primary text-sm disabled:opacity-50">{pending ? "جارٍ التسجيل لدى الهيئة… (قد يستغرق دقيقة)" : "تسجيل وتفعيل وحدة الإصدار"}</button>
        <Result state={state} />
      </div>
      {disabled && <p className="text-xs text-warning-500">أكمل بيانات البائع أولاً.</p>}
    </form>
  );
}

export function ProcessNowButton() {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => setState(await processZatcaNow()))} className="btn-secondary text-xs disabled:opacity-50">
        {pending ? "جارٍ المعالجة…" : "🔄 معالجة المستندات المعلّقة الآن"}
      </button>
      <Result state={state} />
    </div>
  );
}
