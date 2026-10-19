"use client";

import { useActionState, useState } from "react";
import { saveZidAppSettings } from "./actions";

type Source = "admin" | "env" | "none";
type Props = {
  appId: string;
  clientId: string;
  secrets: Record<"clientSecret" | "marketSecret", Source>;
  planMap: Array<{ name: string; key: string }>;
  plans: Array<{ key: string; name: string }>;
};

const SOURCE_LABEL: Record<Source, string> = { admin: "محفوظ من اللوحة", env: "من متغيرات البيئة", none: "غير مضبوط" };

/** نموذج إعدادات تطبيق زد — الحقول النصية مضبوطة الحالة (لا تُفقد عند خطأ)، والأسرار لا تُعرض أبداً. */
export function ZidAppForm(props: Props) {
  const [state, action, pending] = useActionState(saveZidAppSettings, null);
  const [appId, setAppId] = useState(props.appId);
  const [clientId, setClientId] = useState(props.clientId);
  const [rows, setRows] = useState(props.planMap.length ? props.planMap : [{ name: "", key: "" }]);
  const generated = state?.generatedMarketSecret;

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-slate-300">
          رقم التطبيق (App ID)
          <input name="appId" value={appId} onChange={(e) => setAppId(e.target.value)} className="input-field mt-1" dir="ltr" placeholder="مثال: 2404" />
          <span className="mt-1 block text-xs text-slate-500">من صفحة التطبيق في لوحة شركاء زد — يُستخدم كمعرّف اشتراكات الأحداث</span>
        </label>
        <label className="block text-sm text-slate-300">
          Client ID
          <input name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} className="input-field mt-1" dir="ltr" />
          <span className="mt-1 block text-xs text-slate-500">لوحة الشركاء ← التطبيق ← مفاتيح API</span>
        </label>
        <div className="text-sm text-slate-300">
          <label className="block">
            Client Secret <span className="text-xs text-slate-500">({SOURCE_LABEL[props.secrets.clientSecret]})</span>
            <input name="clientSecret" type="password" autoComplete="new-password" className="input-field mt-1" dir="ltr"
              placeholder={props.secrets.clientSecret === "none" ? "غير مضبوط" : "•••••••• اترك فارغاً للإبقاء"} />
          </label>
          {props.secrets.clientSecret === "admin" && (
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" name="clientSecretClear" /> مسح القيمة المحفوظة</label>
          )}
        </div>
        <div className="text-sm text-slate-300">
          <p>سر أحداث متجر التطبيقات <span className="text-xs text-slate-500">({SOURCE_LABEL[props.secrets.marketSecret]})</span></p>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" name="generateMarketSecret" /> ولّد سراً جديداً (يُعرض مرة واحدة لإضافته كترويسة في لوحة شركاء زد)
          </label>
          {props.secrets.marketSecret === "admin" && (
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" name="marketSecretClear" /> مسح السر المحفوظ</label>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-white">ربط باقات زد بباقات DMS</p>
        <p className="text-xs text-slate-500">عند اشتراك التاجر بباقة من متجر تطبيقات زد تُفعَّل له الباقة المقابلة هنا. اكتب اسم الباقة كما يظهر في زد.</p>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <input name="planName" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="input-field flex-1" placeholder="اسم باقة زد" />
            <select name="planKey" value={r.key} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} className="input-field w-48">
              <option value="">— باقة DMS —</option>
              {props.plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
            <button type="button" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ name: "", key: "" }])} className="btn-secondary px-3 text-xs">حذف</button>
          </div>
        ))}
        <button type="button" onClick={() => setRows([...rows, { name: "", key: "" }])} className="text-xs text-accent-400 hover:underline">+ إضافة باقة</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn-primary text-sm disabled:opacity-50">{pending ? "جارٍ الحفظ…" : "حفظ إعدادات زد"}</button>
        {state && <span className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</span>}
      </div>

      {generated && (
        <div className="space-y-2 rounded-lg border border-warning-500/40 bg-warning-500/5 p-4">
          <p className="text-sm font-semibold text-warning-500">سر أحداث المتجر الجديد — انسخه الآن، لن يظهر مرة أخرى:</p>
          <code dir="ltr" className="block break-all rounded bg-black/30 p-2 text-xs text-slate-100">{generated}</code>
          <p className="text-xs text-slate-400">
            في لوحة شركاء زد ← التطبيق ← Webhooks: أضف ترويسة مخصّصة باسم <span dir="ltr" className="text-slate-200">X-DMS-Zid-Token</span> وقيمتها هذا السر.
          </p>
        </div>
      )}
    </form>
  );
}
