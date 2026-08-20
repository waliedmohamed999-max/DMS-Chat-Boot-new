"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setLeadStatus, assignLead, markLeadHandled } from "./actions";
import type { ContactMessageStatus } from "@prisma/client";

export const STATUS_LABELS_AR: Record<ContactMessageStatus, string> = {
  NEW: "جديدة",
  FOLLOWED_UP: "تمت المتابعة",
  CONVERTED: "تحوَّلت لتاجر",
  CLOSED: "مُغلقة",
};

type StaffOption = { id: string; name: string };

export function LeadControls({
  id,
  status,
  assignedToUserId,
  staff,
}: {
  id: string;
  status: ContactMessageStatus;
  assignedToUserId: string | null;
  staff: StaffOption[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "CONVERTED" && (
        <select
          defaultValue={status}
          disabled={isPending}
          onChange={(e) => startTransition(() => setLeadStatus(id, e.target.value as Exclude<ContactMessageStatus, "CONVERTED">))}
          className="input-field h-8 text-xs"
        >
          {(["NEW", "FOLLOWED_UP", "CLOSED"] as const).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS_AR[s]}</option>
          ))}
        </select>
      )}
      {status === "CONVERTED" && <span className="badge bg-success-500/10 text-success-500">{STATUS_LABELS_AR.CONVERTED}</span>}

      {status === "NEW" && (
        <button
          onClick={() => startTransition(() => markLeadHandled(id))}
          disabled={isPending}
          className="btn-secondary text-xs"
        >
          ✅ تمت المتابعة
        </button>
      )}

      <select
        defaultValue={assignedToUserId ?? ""}
        disabled={isPending}
        onChange={(e) => startTransition(() => assignLead(id, e.target.value || null))}
        className="input-field h-8 text-xs"
      >
        <option value="">بلا تعيين</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {status !== "CONVERTED" && (
        <Link href={`/admin/tenants?prefillLead=${id}`} className="btn-secondary text-xs">
          🔁 تحويل إلى تاجر جديد
        </Link>
      )}
    </div>
  );
}
