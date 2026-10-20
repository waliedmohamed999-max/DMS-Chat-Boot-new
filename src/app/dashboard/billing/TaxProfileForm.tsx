"use client";

import { useActionState, useState } from "react";
import { saveTaxProfile } from "./actions";

const FIELDS = [
  { name: "billingLegalName", label: "الاسم القانوني للمنشأة", dir: "rtl", hint: "" },
  { name: "billingVatNumber", label: "الرقم الضريبي (اختياري)", dir: "ltr", hint: "15 رقماً — للحصول على فاتورة ضريبية قياسية" },
  { name: "billingStreet", label: "الشارع", dir: "rtl", hint: "" },
  { name: "billingBuildingNumber", label: "رقم المبنى", dir: "ltr", hint: "4 أرقام" },
  { name: "billingDistrict", label: "الحي", dir: "rtl", hint: "" },
  { name: "billingCity", label: "المدينة", dir: "rtl", hint: "" },
  { name: "billingPostalCode", label: "الرمز البريدي", dir: "ltr", hint: "5 أرقام" },
] as const;

/** البيانات الضريبية للتاجر — مضبوطة الحالة فلا تُفقد القيم عند خطأ التحقق. */
export function TaxProfileForm({ values, canManage }: { values: Record<string, string>; canManage: boolean }) {
  const [state, action, pending] = useActionState(saveTaxProfile, null);
  const [v, setV] = useState(values);
  const registered = (v.billingVatNumber ?? "").trim() !== "";
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.name} className="block text-sm text-slate-300">
            {f.label}
            <input
              name={f.name}
              value={v[f.name] ?? ""}
              onChange={(e) => setV({ ...v, [f.name]: e.target.value })}
              className="input-field mt-1"
              dir={f.dir}
              disabled={!canManage}
              required={f.name === "billingLegalName" || (registered && f.name !== "billingVatNumber")}
              placeholder={f.hint}
            />
          </label>
        ))}
      </div>
      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={pending} className="btn-primary text-sm disabled:opacity-50">{pending ? "جارٍ الحفظ…" : "حفظ البيانات الضريبية"}</button>
          {state && <span className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</span>}
        </div>
      )}
    </form>
  );
}
