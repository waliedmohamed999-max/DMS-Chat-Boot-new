"use client";

import { useState, useTransition } from "react";
import { removeInternalStaff } from "./actions";

export function RemoveStaffButton({ userId, name }: { userId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await removeInternalStaff(userId);
      if (!result.success) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <span className="text-slate-400">حذف {name}؟</span>
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
      <button type="button" onClick={() => setConfirming(true)} className="text-xs text-danger-500 hover:underline">
        حذف
      </button>
      {error && (
        <p className="absolute left-0 top-full z-10 mt-1 w-48 rounded-lg border border-danger-500/30 bg-navy-800 p-2 text-xs text-danger-500 shadow-card">
          {error}
        </p>
      )}
    </div>
  );
}
