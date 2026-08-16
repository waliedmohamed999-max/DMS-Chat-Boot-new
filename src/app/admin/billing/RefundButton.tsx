"use client";

import { useState, useTransition } from "react";
import { issueRefund } from "./actions";

export function RefundButton({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  if (success) {
    return <span className="badge bg-success-500/10 text-success-500 text-xs">تم إصدار إشعار دائن #{success}</span>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-danger-500 hover:underline">
        استرداد
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="سبب الاسترداد (إلزامي)"
        className="input-field h-7 w-40 text-xs"
      />
      {error && <p className="text-xs text-danger-500">{error}</p>}
      <div className="flex gap-1">
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await issueRefund(invoiceId, reason);
              if (result.success) setSuccess(result.creditNoteNumber);
              else setError(result.error);
            })
          }
          className="text-xs text-danger-500 hover:underline disabled:opacity-50"
        >
          {isPending ? "جارٍ..." : "تأكيد الاسترداد"}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">إلغاء</button>
      </div>
    </div>
  );
}
