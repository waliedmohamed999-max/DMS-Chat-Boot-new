"use client";

import { useActionState } from "react";
import { saveWalletSettings, upsertMessageRate, type ActionResult } from "./actions";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return <p className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</p>;
}

export function WalletSettingsForm({ markupPercent, minRechargeSar }: { markupPercent: number; minRechargeSar: number }) {
  const [state, action, pending] = useActionState(saveWalletSettings, null);
  return (
    <form action={action} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
      <label className="block text-sm text-slate-300">
        هامش الربح على سعر Meta (%)
        <input name="markupPercent" type="number" step="0.01" min={0} max={500} defaultValue={markupPercent} required dir="ltr" className="input-field mt-1" />
      </label>
      <label className="block text-sm text-slate-300">
        الحد الأدنى لشحن المحفظة (ر.س)
        <input name="minRechargeSar" type="number" step="1" min={1} defaultValue={minRechargeSar} required dir="ltr" className="input-field mt-1" />
      </label>
      <button disabled={pending} className="btn-primary disabled:opacity-50">{pending ? "جارٍ الحفظ…" : "حفظ"}</button>
      <div className="sm:col-span-3"><Feedback state={state} /></div>
    </form>
  );
}

export function RateForm() {
  const [state, action, pending] = useActionState(upsertMessageRate, null);
  const kept = state && !state.ok ? state.fields : undefined;
  return (
    <form key={state ? JSON.stringify(state) : "initial"} action={action} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
      <label className="block text-sm text-slate-300">
        الدولة (SA, AE, EG… أو * للافتراضي)
        <input name="country" required maxLength={3} defaultValue={kept?.country ?? "SA"} dir="ltr" className="input-field mt-1 uppercase" />
      </label>
      <label className="block text-sm text-slate-300">
        الفئة
        <select name="category" className="input-field mt-1" defaultValue={kept?.category ?? "MARKETING"}>
          <option value="MARKETING">تسويقية (MARKETING)</option>
          <option value="UTILITY">خدمية (UTILITY)</option>
          <option value="AUTHENTICATION">مصادقة (AUTHENTICATION)</option>
        </select>
      </label>
      <label className="block text-sm text-slate-300">
        سعر Meta للرسالة (ر.س)
        <input name="baseRateSar" type="number" step="0.0001" min={0} required dir="ltr" className="input-field mt-1" placeholder="0.0000" defaultValue={kept?.baseRateSar ?? ""} />
      </label>
      <button disabled={pending} className="btn-primary disabled:opacity-50">{pending ? "جارٍ الحفظ…" : "إضافة / تحديث"}</button>
      <div className="sm:col-span-4"><Feedback state={state} /></div>
    </form>
  );
}
