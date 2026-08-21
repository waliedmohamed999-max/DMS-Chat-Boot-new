"use client";

import { useEffect, useState, useTransition } from "react";
import { dismissAnnouncement, recordAnnouncementView } from "@/app/dashboard/announcements-actions";
import { SEVERITY_ICON, SEVERITY_BANNER_CLASSES } from "@/lib/announcements/severity";
import type { AnnouncementSeverity } from "@prisma/client";

export function AnnouncementBanner({
  id, title, body, severity, dismissible,
}: {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  dismissible: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();

  // يُسجَّل مرة واحدة عند ظهور البانر فعلياً في المتصفح — فشل الشبكة هنا لا يجب أن يكسر عرض البانر.
  useEffect(() => {
    void recordAnnouncementView(id).catch(() => {});
  }, [id]);

  if (dismissed) return null;

  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${SEVERITY_BANNER_CLASSES[severity]}`}>
      <div>
        <p className="font-semibold">{SEVERITY_ICON[severity]} {title}</p>
        <p className="mt-0.5 text-slate-300">{body}</p>
      </div>
      {dismissible && (
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
      )}
    </div>
  );
}
