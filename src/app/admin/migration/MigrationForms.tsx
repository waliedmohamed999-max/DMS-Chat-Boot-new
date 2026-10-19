"use client";

import { useActionState } from "react";
import { finalizeMigration, inviteSelected } from "./actions";

/** زر "دعوة المحددين" — مربعات الاختيار في الجدول مربوطة بهذا النموذج عبر الخاصية form (بلا نماذج متداخلة). */
export function InviteForm({ formId }: { formId: string }) {
  const [state, action, pending] = useActionState(inviteSelected, null);
  return (
    <form id={formId} action={action} className="flex flex-wrap items-center gap-3">
      <button disabled={pending} className="btn-primary text-sm disabled:opacity-50">{pending ? "جارٍ الإرسال…" : "📨 دعوة المحددين للنقل"}</button>
      {state && <span className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</span>}
    </form>
  );
}

export function FinalizeButton({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [state, action, pending] = useActionState(finalizeMigration, null);
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm(`فصل ربط Meta القديم لـ ${tenantName}؟ الإرسال سيكون عبر 360dialog فقط.`)) e.preventDefault(); }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="tenantId" value={tenantId} />
      <button disabled={pending} className="btn-secondary text-xs disabled:opacity-50">{pending ? "…" : "إنهاء النقل"}</button>
      {state && <span className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</span>}
    </form>
  );
}
