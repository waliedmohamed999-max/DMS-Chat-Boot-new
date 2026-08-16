"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestPayout } from "@/app/affiliates/dashboard/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary text-sm disabled:opacity-50">
      {pending ? "جاري الإرسال..." : "طلب صرف الرصيد المعتمد"}
    </button>
  );
}

export function PayoutRequestForm() {
  const [state, formAction] = useFormState(requestPayout, { error: null });
  return (
    <form action={formAction} className="space-y-2">
      {state.error && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-500">{state.error}</div>
      )}
      <input name="method" required className="input-field text-sm" placeholder="مثال: تحويل بنكي — SA00 0000 0000 0000 0000 0000" />
      <SubmitButton />
    </form>
  );
}
