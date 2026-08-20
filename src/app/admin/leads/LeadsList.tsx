"use client";

import { useState } from "react";
import { LeadControls } from "./LeadControls";
import { STATUS_LABELS_AR } from "./LeadControls";
import { timeSinceAr } from "@/lib/timeSinceAr";
import type { ContactMessageStatus } from "@prisma/client";

type StaffOption = { id: string; name: string };

export type LeadMessage = {
  id: string;
  name: string;
  email: string;
  phone: string;
  activityType: string;
  inquiryType: string;
  message: string;
  status: ContactMessageStatus;
  assignedToUserId: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
};

const STATUS_FILTERS: { key: ContactMessageStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "الكل" },
  { key: "NEW", label: STATUS_LABELS_AR.NEW },
  { key: "FOLLOWED_UP", label: STATUS_LABELS_AR.FOLLOWED_UP },
  { key: "CONVERTED", label: STATUS_LABELS_AR.CONVERTED },
  { key: "CLOSED", label: STATUS_LABELS_AR.CLOSED },
];

/** لون مؤشر "منذ متى" — تحذيري بعد 24 ساعة وخطر بعد 72 ساعة، لكن فقط لرسائل NEW لم تُتابَع بعد
 * (نفس نمط الألوان في admin/health/page.tsx لمؤشرات المخاطر). بقية الحالات محايدة دائماً. */
function ageColorClass(status: ContactMessageStatus, createdAt: string): string {
  if (status !== "NEW") return "text-slate-500";
  const hours = (Date.now() - new Date(createdAt).getTime()) / (3600 * 1000);
  if (hours > 72) return "text-danger-500 font-medium";
  if (hours > 24) return "text-warning-500";
  return "text-slate-500";
}

export function LeadsList({ messages, staff }: { messages: LeadMessage[]; staff: StaffOption[] }) {
  const [statusFilter, setStatusFilter] = useState<ContactMessageStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const counts = messages.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<ContactMessageStatus, number>>);

  const query = search.trim().toLowerCase();
  const visible = messages.filter((m) => {
    if (statusFilter !== "ALL" && m.status !== statusFilter) return false;
    if (unassignedOnly && m.assignedToUserId !== null) return false;
    if (query) {
      const haystack = `${m.name} ${m.email} ${m.phone} ${m.message}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`badge transition ${statusFilter === f.key ? "bg-accent-500/20 text-accent-400" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            {f.label} ({f.key === "ALL" ? messages.length : (counts[f.key as ContactMessageStatus] ?? 0)})
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} className="h-3.5 w-3.5" />
          غير معيَّنة فقط
        </label>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث بالاسم، البريد، الهاتف، أو نص الرسالة..."
        className="input-field text-sm"
      />

      <div className="space-y-3">
        {visible.map((m) => (
          <div key={m.id} className={`card p-5 ${m.status === "CLOSED" || m.status === "CONVERTED" ? "opacity-60" : ""}`}>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">{m.name}</p>
                <p className="text-xs text-slate-500">
                  {m.activityType} · {new Date(m.createdAt).toLocaleString("ar-SA")}
                  {" · "}
                  <span className={ageColorClass(m.status, m.createdAt)}>{timeSinceAr(m.createdAt)}</span>
                  {m.assignedTo && <span> · معيَّنة لـ{m.assignedTo.name}</span>}
                </p>
              </div>
              <span className="badge bg-accent-500/10 text-accent-400">{m.inquiryType}</span>
            </div>
            <div className="mb-2 flex gap-4 text-sm text-slate-400" dir="ltr">
              <a href={`mailto:${m.email}`} className="hover:underline">{m.email}</a>
              <a href={`tel:${m.phone}`} className="hover:underline">{m.phone}</a>
            </div>
            <p className="mb-3 rounded-lg bg-navy-900 p-3 text-sm text-slate-300">{m.message}</p>
            <LeadControls id={m.id} status={m.status} assignedToUserId={m.assignedToUserId} staff={staff} />
          </div>
        ))}
        {visible.length === 0 && (
          <div className="card p-8 text-center text-slate-500">
            {messages.length === 0 ? "لا توجد رسائل تواصل بعد." : "لا توجد رسائل مطابقة للفلاتر الحالية."}
          </div>
        )}
      </div>
    </div>
  );
}
