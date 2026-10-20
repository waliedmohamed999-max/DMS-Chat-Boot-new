"use client";

import { useTransition } from "react";
import { retryFailedPayment } from "./actions";

export function RetryPaymentButton({ invoiceId }: { invoiceId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const res = await retryFailedPayment(invoiceId);
          if (res.success && res.redirectUrl) window.location.href = res.redirectUrl;
          else if (!res.success) alert(res.error);
        })
      }
      disabled={isPending}
      className="btn-secondary text-xs disabled:opacity-50"
    >
      {isPending ? "جارٍ التجهيز..." : "ادفع الآن"}
    </button>
  );
}
