"use client";

import { useActionState, useEffect, useState } from "react";
import { startWalletRecharge, updateMyMinAlert } from "./actions";

export function RechargeForm({ minRecharge, enabled }: { minRecharge: number; enabled: boolean }) {
  const [state, action, pending] = useActionState(startWalletRecharge, null);
  const presets = [minRecharge, 500, 1000, 2500].filter((v, i, a) => v >= minRecharge && a.indexOf(v) === i);
  const [amount, setAmount] = useState(String(presets[0] ?? minRecharge));

  // الانتقال لصفحة الدفع المستضافة لدى Moyasar بعد إنشاء الفاتورة.
  useEffect(() => {
    if (state?.ok) window.location.href = state.paymentUrl;
  }, [state]);
  useEffect(() => {
    if (state && !state.ok && state.amount) setAmount(state.amount);
  }, [state]);

  if (!enabled) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
        الدفع الإلكتروني غير مفعّل بعد على المنصة. للشحن الآن: حوّل المبلغ بنكياً وتواصل مع فريق الدعم ليُضاف لمحفظتك.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(String(p))}
            className={`rounded-lg border px-4 py-2 text-sm ${amount === String(p) ? "border-accent-500 bg-accent-500/10 text-white" : "border-white/10 text-slate-300 hover:bg-white/5"}`}
          >
            {p.toLocaleString("en-US")} ر.س
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm text-slate-300">
          المبلغ (ر.س)
          <input name="amount" type="number" step="0.01" min={minRecharge} value={amount} onChange={(e) => setAmount(e.target.value)} required dir="ltr" className="input-field mt-1 w-40" />
        </label>
        <button disabled={pending || state?.ok} className="btn-primary disabled:opacity-50">
          {pending || state?.ok ? "جارٍ التحويل لصفحة الدفع…" : "💳 شحن عبر Moyasar"}
        </button>
      </div>
      <p className="text-xs text-slate-500">الحد الأدنى {minRecharge} ر.س — الدفع بمدى أو فيزا/ماستركارد أو Apple Pay عبر صفحة Moyasar الآمنة.</p>
      {state && !state.ok && <p className="text-sm text-danger-500">{state.message}</p>}
    </form>
  );
}

export function MyMinAlertForm({ minAlert }: { minAlert: number }) {
  const [state, action, pending] = useActionState(updateMyMinAlert, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="block text-sm text-slate-300">
        نبّهني بالبريد عندما يقل الرصيد عن (ر.س)
        <input name="minAlert" type="number" step="0.01" min={0} defaultValue={minAlert} required dir="ltr" className="input-field mt-1 w-40" />
      </label>
      <button disabled={pending} className="btn-secondary text-sm disabled:opacity-50">حفظ</button>
      {state && <p className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</p>}
    </form>
  );
}
