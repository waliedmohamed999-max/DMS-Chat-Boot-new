"use client";

import { useActionState, useState } from "react";
import { saveAccountSecrets, type AccountSection } from "./actions";

type Source = "admin" | "env" | "none";
type Field = { name: string; label: string; secret?: boolean; placeholder?: string; hint?: string; type?: "select"; options?: Array<{ value: string; label: string }> };

const SOURCE_LABEL: Record<Source, string> = { admin: "محفوظ من اللوحة", env: "من متغيرات البيئة", none: "غير مضبوط" };

const FIELDS: Record<AccountSection, Field[]> = {
  d360: [
    { name: "D360_PARTNER_ID", label: "Partner ID", placeholder: "من لوحة شريك 360dialog" },
    { name: "D360_API_KEY", label: "مفتاح Partner API", secret: true },
    { name: "D360_WEBHOOK_SECRET", label: "سر توقيع webhooks الشريك", secret: true },
  ],
  moyasar: [
    { name: "MOYASAR_SECRET_KEY", label: "المفتاح السري", secret: true, placeholder: "sk_test_... أو sk_live_...", hint: "لوحة Moyasar ← Settings ← API Keys" },
    { name: "MOYASAR_WEBHOOK_SECRET", label: "سر الإشعارات (اختياري)", secret: true },
  ],
  email: [
    { name: "EMAIL_PROVIDER", label: "مزوّد البريد", type: "select", options: [{ value: "smtp", label: "SMTP (إرسال حقيقي)" }, { value: "console", label: "سجل الخادم فقط (تجريبي)" }] },
    { name: "SMTP_HOST", label: "خادم SMTP", placeholder: "mail.dmstech.sa" },
    { name: "SMTP_PORT", label: "المنفذ", placeholder: "465" },
    { name: "SMTP_USER", label: "اسم المستخدم", placeholder: "info@dmstech.sa" },
    { name: "SMTP_PASS", label: "كلمة مرور البريد", secret: true },
    { name: "EMAIL_FROM", label: "المُرسِل (From)", placeholder: "DMS Tech <info@dmstech.sa>" },
  ],
};

/**
 * نموذج ربط حساب خارجي داخل المنصة. القيم غير السرية تُعرض للتعديل؛ الأسرار لا تُعرض أبداً (حقل فارغ =
 * إبقاء القيمة). الحفظ يتطلب كلمة مرور الأدمن. القيم النصية مضبوطة الحالة فلا تُفقد عند خطأ التحقق.
 */
export function AccountForm({ section, values, sources }: { section: AccountSection; values: Record<string, string>; sources: Record<string, Source> }) {
  const [state, action, pending] = useActionState(saveAccountSecrets, null);
  const [text, setText] = useState<Record<string, string>>(values);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-xs">
        🔑 ربط / تعديل المفاتيح
      </button>
    );
  }

  return (
    <form action={action} className="w-full space-y-3 rounded-lg border border-white/10 p-3">
      <input type="hidden" name="section" value={section} />
      {FIELDS[section].map((f) => (
        <div key={f.name} className="text-sm text-slate-300">
          <label className="block">
            {f.label} <span className="text-xs text-slate-500">({SOURCE_LABEL[sources[f.name] ?? "none"]})</span>
            {f.type === "select" ? (
              <select name={f.name} value={text[f.name] ?? "console"} onChange={(e) => setText({ ...text, [f.name]: e.target.value })} className="input-field mt-1">
                {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.secret ? (
              <input name={f.name} type="password" autoComplete="new-password" className="input-field mt-1" dir="ltr"
                placeholder={sources[f.name] === "none" ? f.placeholder ?? "غير مضبوط" : "•••••••• اترك فارغاً للإبقاء"} />
            ) : (
              <input name={f.name} value={text[f.name] ?? ""} onChange={(e) => setText({ ...text, [f.name]: e.target.value })} className="input-field mt-1" dir="ltr" placeholder={f.placeholder} />
            )}
          </label>
          {f.hint && <span className="mt-1 block text-xs text-slate-500">{f.hint}</span>}
          {f.secret && sources[f.name] === "admin" && (
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" name={`${f.name}__clear`} /> مسح القيمة المحفوظة</label>
          )}
        </div>
      ))}
      <label className="block border-t border-white/5 pt-3 text-sm text-slate-300">
        كلمة مرورك (للتأكيد)
        <input name="confirmPassword" type="password" required autoComplete="current-password" className="input-field mt-1" dir="ltr" />
        <span className="mt-1 block text-xs text-slate-500">حماية إضافية: تغيير مفاتيح الدفع والرسائل يتطلب كلمة مرورك حتى مع جلسة مفتوحة.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn-primary text-sm disabled:opacity-50">{pending ? "جارٍ الحفظ…" : "حفظ وتشفير"}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm">إغلاق</button>
        {state && <span className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
