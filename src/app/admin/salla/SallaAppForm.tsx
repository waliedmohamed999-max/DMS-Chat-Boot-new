"use client";

import { useActionState, useState } from "react";
import { saveSallaAppSettings } from "./actions";

type Source = "admin" | "env" | "none";
type Props = {
  appId: string;
  clientId: string;
  secrets: Record<"clientSecret" | "webhookSecret" | "functionsSecret", Source>;
  planMap: Array<{ name: string; key: string }>;
  plans: Array<{ key: string; name: string }>;
  onboardingEndpoint: string;
};

const SOURCE_LABEL: Record<Source, string> = { admin: "محفوظ من اللوحة", env: "من متغيرات البيئة", none: "غير مضبوط" };

const SECRET_FIELDS = [
  { name: "clientSecret", label: "Client Secret", hint: "مفاتيح التطبيقات ← المفتاح السري للعميل" },
  { name: "webhookSecret", label: "Webhook Secret", hint: "التنبيهات (Webhooks) ← مفتاح التنبيهات السري" },
] as const;

/** نموذج إعدادات تطبيق سلة — الحقول النصية مضبوطة الحالة (لا تُفقد عند خطأ)، والأسرار لا تُعرض أبداً. */
export function SallaAppForm(props: Props) {
  const [state, action, pending] = useActionState(saveSallaAppSettings, null);
  const [appId, setAppId] = useState(props.appId);
  const [clientId, setClientId] = useState(props.clientId);
  const [rows, setRows] = useState(props.planMap.length ? props.planMap : [{ name: "", key: "" }]);
  const generated = state?.generatedFunctionsSecret;

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-slate-300">
          رقم التطبيق (App ID)
          <input name="appId" value={appId} onChange={(e) => setAppId(e.target.value)} className="input-field mt-1" dir="ltr" placeholder="مثال: 1234567890" />
          <span className="mt-1 block text-xs text-slate-500">أعلى صفحة التطبيق في بوابة الشركاء — يفعّل زر "ربط متجر سلة" والصفحة المضمَّنة</span>
        </label>
        <label className="block text-sm text-slate-300">
          Client ID
          <input name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} className="input-field mt-1" dir="ltr" />
          <span className="mt-1 block text-xs text-slate-500">مفاتيح التطبيقات ← الرقم التعريفي للعميل</span>
        </label>
        {SECRET_FIELDS.map((f) => (
          <div key={f.name} className="text-sm text-slate-300">
            <label className="block">
              {f.label} <span className="text-xs text-slate-500">({SOURCE_LABEL[props.secrets[f.name]]})</span>
              <input name={f.name} type="password" autoComplete="new-password" className="input-field mt-1" dir="ltr"
                placeholder={props.secrets[f.name] === "none" ? "غير مضبوط" : "•••••••• اترك فارغاً للإبقاء"} />
            </label>
            <span className="mt-1 block text-xs text-slate-500">{f.hint}</span>
            {props.secrets[f.name] === "admin" && (
              <label className="mt-1 flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" name={`${f.name}Clear`} /> مسح القيمة المحفوظة</label>
            )}
          </div>
        ))}
        <div className="text-sm text-slate-300 md:col-span-2">
          <label className="block">
            سر دوال خطوات التثبيت <span className="text-xs text-slate-500">({SOURCE_LABEL[props.secrets.functionsSecret]})</span>
            <input name="functionsSecret" type="password" autoComplete="new-password" className="input-field mt-1" dir="ltr" placeholder="اترك فارغاً للإبقاء — أو ولّد سراً جديداً" />
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" name="generateFunctionsSecret" /> ولّد سراً جديداً تلقائياً (يُعرض مرة واحدة لتلصقه في كود الدالتين في سلة)
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-white">ربط باقات سلة بباقات DMS</p>
        <p className="text-xs text-slate-500">عند اشتراك التاجر بباقة من متجر تطبيقات سلة تُفعَّل له الباقة المقابلة هنا. اكتب اسم الباقة كما يظهر في سلة.</p>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <input name="planName" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="input-field flex-1" placeholder="اسم باقة سلة" />
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
        <button disabled={pending} className="btn-primary text-sm disabled:opacity-50">{pending ? "جارٍ الحفظ…" : "حفظ إعدادات سلة"}</button>
        {state && <span className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</span>}
      </div>

      {generated && (
        <div className="space-y-2 rounded-lg border border-warning-500/40 bg-warning-500/5 p-4">
          <p className="text-sm font-semibold text-warning-500">سر الدوال الجديد — انسخه الآن، لن يظهر مرة أخرى:</p>
          <code dir="ltr" className="block break-all rounded bg-black/30 p-2 text-xs text-slate-100">{generated}</code>
          <p className="text-xs text-slate-400">
            الصقه مكان قيمة SECRET في كود الدالتين (خطوات تثبيت التطبيق) في بوابة شركاء سلة. رابط الدوال: <span dir="ltr">{props.onboardingEndpoint}</span>
          </p>
        </div>
      )}
    </form>
  );
}
