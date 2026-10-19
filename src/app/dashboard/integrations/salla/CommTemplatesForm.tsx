"use client";

import { useActionState } from "react";
import { saveSallaCommTemplates } from "./actions";

type T = { id: string; name: string; category: string; bodyText: string };

const ROWS = [
  { key: "UTILITY", label: "إشعارات الطلبات (حالة الطلب، الفاتورة، الشحن…)" },
  { key: "AUTHENTICATION", label: "رموز التحقق (OTP) — يوضع الرمز في المتغير {{1}}" },
  { key: "MARKETING", label: "الرسائل التسويقية من سلة" },
] as const;

export function CommTemplatesForm({ templates, current }: { templates: T[]; current: Record<string, string | undefined> }) {
  const [state, action, pending] = useActionState(saveSallaCommTemplates, null);
  return (
    <form action={action} className="space-y-3">
      {ROWS.map((r) => {
        const options = templates.filter((t) => t.category.toUpperCase() === r.key && t.bodyText.includes("{{1}}"));
        return (
          <label key={r.key} className="block text-sm text-slate-300">
            {r.label}
            <select name={r.key} defaultValue={current[r.key] ?? ""} className="input-field mt-1">
              <option value="">— بدون (الإرسال داخل نافذة الـ24 ساعة فقط) —</option>
              {options.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {options.length === 0 && <span className="mt-1 block text-xs text-slate-500">لا قوالب معتمدة من هذه الفئة فيها المتغير {"{{1}}"} — أنشئها من قوالب الرسائل.</span>}
          </label>
        );
      })}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary text-sm disabled:opacity-50">{pending ? "جارٍ الحفظ…" : "حفظ القوالب"}</button>
        {state && <span className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
