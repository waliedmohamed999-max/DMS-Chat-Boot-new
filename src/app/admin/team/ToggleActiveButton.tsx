"use client";

import { useState, useTransition } from "react";
import { toggleInternalStaffActive } from "./actions";

export function ToggleActiveButton({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await toggleInternalStaffActive(userId, !isActive);
      if (!result.success) setError(result.error);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`badge ${isActive ? "bg-success-500/10 text-success-500" : "bg-danger-500/10 text-danger-500"} disabled:opacity-50`}
      >
        {isActive ? "نشط" : "معطّل"}
      </button>
      {error && (
        <p className="absolute left-0 top-full z-10 mt-1 w-48 rounded-lg border border-danger-500/30 bg-navy-800 p-2 text-xs text-danger-500 shadow-card">
          {error}
        </p>
      )}
    </div>
  );
}
