"use client";

import { useState, useTransition } from "react";
import { changeInternalStaffRole } from "./actions";

export function RoleSelect({ userId, currentRole }: { userId: string; currentRole: "PLATFORM_SUPPORT" | "PLATFORM_BILLING" }) {
  const [role, setRole] = useState(currentRole);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(newRole: string) {
    const previous = role;
    setRole(newRole as typeof currentRole);
    setError(null);
    startTransition(async () => {
      const result = await changeInternalStaffRole(userId, newRole);
      if (!result.success) {
        setRole(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="relative">
      <select
        value={role}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        className="input-field !py-1 text-xs disabled:opacity-50"
      >
        <option value="PLATFORM_SUPPORT">دعم فني</option>
        <option value="PLATFORM_BILLING">مالي</option>
      </select>
      {error && (
        <p className="absolute left-0 top-full z-10 mt-1 w-48 rounded-lg border border-danger-500/30 bg-navy-800 p-2 text-xs text-danger-500 shadow-card">
          {error}
        </p>
      )}
    </div>
  );
}
