"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resumePausedCampaign } from "../actions";

/** حملة لمرة واحدة توقفت لنفاد رصيد محفظة الرسائل — تُستأنف من حيث توقفت بعد الشحن. */
export function ResumeCampaignButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <div className="card space-y-2 border border-warning-500/30 bg-warning-500/5 p-4 text-sm">
      <p className="font-semibold text-warning-500">⏸️ توقفت الحملة لنفاد رصيد محفظة الرسائل</p>
      <p className="text-slate-300">اشحن المحفظة ثم استأنف — تُكمل الحملة من حيث توقفت ولا تُعاد لمن وصلته الرسالة.</p>
      <div className="flex flex-wrap gap-2">
        <a href="/dashboard/billing/wallet" className="btn-secondary text-xs">شحن المحفظة</a>
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const r = await resumePausedCampaign(campaignId);
              if (!r.success) setError(r.error);
              else router.refresh();
            })
          }
          className="btn-primary text-xs disabled:opacity-50"
        >
          {isPending ? "جارٍ الاستئناف…" : "▶️ استئناف الحملة"}
        </button>
      </div>
      {error && <p className="text-xs text-danger-500">{error}</p>}
    </div>
  );
}
