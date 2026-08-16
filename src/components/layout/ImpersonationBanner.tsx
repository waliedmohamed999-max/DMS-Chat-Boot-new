"use client";

import { endImpersonationAction } from "@/app/dashboard/impersonation-actions";
import { useTransition } from "react";

export function ImpersonationBanner({ tenantName, superAdminName }: { tenantName: string; superAdminName: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between bg-danger-600 px-4 py-2 text-sm text-white">
      <span>
        🕵️ أنت الآن تتصفح <strong>كخبير</strong> داخل حساب <strong>{tenantName}</strong> (بواسطة {superAdminName}) — كل نشاطك هنا مسجَّل في سجل التدقيق.
      </span>
      <button
        onClick={() => startTransition(() => endImpersonationAction())}
        disabled={isPending}
        className="rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30"
      >
        {isPending ? "جاري الخروج..." : "🚪 خروج"}
      </button>
    </div>
  );
}
