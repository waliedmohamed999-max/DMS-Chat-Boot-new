"use client";

import { useState, useTransition } from "react";
import { retryFailedPaymentAsAdmin } from "./actions";

export function RetryPaymentButton({ invoiceId }: { invoiceId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="text-left">
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await retryFailedPaymentAsAdmin(invoiceId);
            if (!result.success) setError(result.error);
          })
        }
        className="btn-secondary text-xs disabled:opacity-50"
      >
        {isPending ? "جارٍ إعادة المحاولة..." : "🔁 إعادة محاولة التحصيل"}
      </button>
      {error && <p className="mt-1 text-xs text-danger-500">{error}</p>}
    </div>
  );
}
