"use client";

import { useState, useTransition } from "react";
import { dismissAnnouncement } from "@/app/dashboard/announcements-actions";

export function AnnouncementBanner({ id, title, body }: { id: string; title: string; body: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (dismissed) return null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-accent-500/30 bg-accent-500/10 px-4 py-3 text-sm">
      <div>
        <p className="font-semibold text-accent-400">📢 {title}</p>
        <p className="mt-0.5 text-slate-300">{body}</p>
      </div>
      <button
        onClick={() => {
          setDismissed(true);
          startTransition(() => dismissAnnouncement(id));
        }}
        disabled={isPending}
        className="shrink-0 text-xs text-slate-400 hover:text-slate-200"
      >
        إغلاق ✕
      </button>
    </div>
  );
}
