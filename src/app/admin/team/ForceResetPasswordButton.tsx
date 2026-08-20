"use client";

import { useState, useTransition } from "react";
import { forceResetInternalStaffPassword } from "./actions";

/** بنفس أسلوب RemoveStaffButton.tsx (تأكيد قبل تنفيذ) — إعادة التعيين فورية لا رجعة فيها. */
export function ForceResetPasswordButton({ userId }: { userId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await forceResetInternalStaffPassword(userId);
      if (result.success) {
        setSent(true);
        setConfirming(false);
      } else {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  if (sent) return <span className="text-xs text-success-500">تم إبطال كلمة المرور القديمة وإرسال رابط إعداد جديد</span>;

  if (confirming) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <span className="text-slate-400">تبطل كلمة المرور الحالية فوراً — متأكد؟</span>
        <button type="button" onClick={handleConfirm} disabled={isPending} className="rounded bg-danger-500/20 px-2 py-1 text-danger-500 disabled:opacity-50">
          تأكيد
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded bg-white/5 px-2 py-1 text-slate-300">
          إلغاء
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setConfirming(true)} className="text-xs text-wa-500 hover:underline">
        إعادة تعيين كلمة المرور
      </button>
      {error && (
        <p className="absolute left-0 top-full z-10 mt-1 w-48 rounded-lg border border-danger-500/30 bg-navy-800 p-2 text-xs text-danger-500 shadow-card">
          {error}
        </p>
      )}
    </div>
  );
}
