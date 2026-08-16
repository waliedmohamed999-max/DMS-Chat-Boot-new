"use client";

import { useState, useTransition } from "react";
import { resendStaffSetupLink } from "./actions";

export function ResendSetupLinkButton({ userId }: { userId: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await resendStaffSetupLink(userId);
      if (result.success) setSent(true);
      else setError(result.error);
    });
  }

  if (sent) return <span className="text-xs text-success-500">تم الإرسال</span>;

  return (
    <div className="relative">
      <button type="button" onClick={handleClick} disabled={isPending} className="text-xs text-wa-500 hover:underline disabled:opacity-50">
        {isPending ? "جارٍ الإرسال..." : "إعادة إرسال رابط الإعداد"}
      </button>
      {error && (
        <p className="absolute left-0 top-full z-10 mt-1 w-48 rounded-lg border border-danger-500/30 bg-navy-800 p-2 text-xs text-danger-500 shadow-card">
          {error}
        </p>
      )}
    </div>
  );
}
