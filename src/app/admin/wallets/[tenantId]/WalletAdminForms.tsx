"use client";

import { useActionState } from "react";
import { adjustWalletAction, setMinAlertAction, type WalletActionResult } from "../actions";

function Feedback({ state }: { state: WalletActionResult | null }) {
  if (!state) return null;
  return <p className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</p>;
}

export function AdjustWalletForm({ tenantId }: { tenantId: string }) {
  const [state, action, pending] = useActionState(adjustWalletAction.bind(null, tenantId), null);
  const kept = state && !state.ok ? state.fields : undefined;
  return (
    <form key={state ? JSON.stringify(state) : "initial"} action={action} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
      <label className="block text-sm text-slate-300">
        النوع
        <select name="direction" className="input-field mt-1" defaultValue={kept?.direction ?? "credit"}>
          <option value="credit">إضافة رصيد</option>
          <option value="debit">خصم رصيد</option>
        </select>
      </label>
      <label className="block text-sm text-slate-300">
        المبلغ (ر.س)
        <input name="amount" type="number" step="0.01" min="0.01" required dir="ltr" className="input-field mt-1" defaultValue={kept?.amount ?? ""} />
      </label>
      <label className="block text-sm text-slate-300">
        السبب (يظهر في سجل الحركات)
        <input name="reason" required maxLength={200} className="input-field mt-1" placeholder="تحويل بنكي #… / تعويض" defaultValue={kept?.reason ?? ""} />
      </label>
      <button disabled={pending} className="btn-primary disabled:opacity-50">{pending ? "جارٍ التنفيذ…" : "تنفيذ"}</button>
      <div className="sm:col-span-4"><Feedback state={state} /></div>
    </form>
  );
}

export function MinAlertForm({ tenantId, minAlert }: { tenantId: string; minAlert: number }) {
  const [state, action, pending] = useActionState(setMinAlertAction.bind(null, tenantId), null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="block text-sm text-slate-300">
        حد تنبيه الرصيد المنخفض (ر.س)
        <input name="minAlert" type="number" step="0.01" min={0} defaultValue={minAlert} required dir="ltr" className="input-field mt-1 w-40" />
      </label>
      <button disabled={pending} className="btn-secondary disabled:opacity-50">{pending ? "…" : "حفظ"}</button>
      <Feedback state={state} />
    </form>
  );
}
