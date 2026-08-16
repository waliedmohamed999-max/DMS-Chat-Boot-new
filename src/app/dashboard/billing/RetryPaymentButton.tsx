"use client";

import { useTransition } from "react";
import { retryFailedPayment } from "./actions";

export function RetryPaymentButton({ invoiceId }: { invoiceId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(async () => { await retryFailedPayment(invoiceId); })}
      disabled={isPending}
      className="btn-secondary text-xs disabled:opacity-50"
    >
      {isPending ? "جارٍ إعادة المحاولة..." : "إعادة المحاولة الآن"}
    </button>
  );
}
