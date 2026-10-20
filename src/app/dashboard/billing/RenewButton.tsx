"use client";

import { useState, useTransition } from "react";
import { renewSubscription } from "./actions";

/** اشتراك/تجديد لدورة كاملة عبر صفحة الدفع الآمنة (فترة تجريبية أو اشتراك منتهٍ/متأخر). */
export function RenewButton({ label }: { label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await renewSubscription();
            if (res.success && res.redirectUrl) window.location.href = res.redirectUrl;
            else if (!res.success) setError(res.error);
          })
        }
        className="btn-primary text-sm disabled:opacity-50"
      >
        {pending ? "جارٍ التجهيز…" : label}
      </button>
      {error && <p className="text-xs text-danger-500">{error}</p>}
    </div>
  );
}
