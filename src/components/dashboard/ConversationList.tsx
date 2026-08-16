"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ConversationListItem = {
  id: string;
  status: string;
  controlMode: string;
  lastMessageAt: string;
  contact: { name: string; phoneE164: string };
  lastMessageBody: string | null;
  assignedAgentName: string | null;
  isSlaBreached: boolean;
};

type TeamMember = { id: string; name: string };

const STATUS_TABS = [
  { value: "ALL", label: "الكل" },
  { value: "NEW", label: "جديد" },
  { value: "NEEDS_REPLY", label: "يحتاج رد" },
  { value: "OPEN", label: "بانتظار العميل" },
  { value: "RESOLVED", label: "تم الحل" },
] as const;

const POLL_INTERVAL_MS = 4000;

export function ConversationList({ teamMembers }: { teamMembers: TeamMember[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeStatus = searchParams.get("status") ?? "NEEDS_REPLY";
  const q = searchParams.get("q") ?? "";
  const assigneeId = searchParams.get("assigneeId") ?? "";
  const controlMode = searchParams.get("controlMode") ?? "";

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const params = new URLSearchParams();
      if (activeStatus) params.set("status", activeStatus);
      if (q) params.set("q", q);
      if (assigneeId) params.set("assigneeId", assigneeId);
      if (controlMode) params.set("controlMode", controlMode);
      const res = await fetch(`/api/inbox/conversations?${params.toString()}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setConversations(data.conversations);
      setCounts(data.counts);
    }
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeStatus, q, assigneeId, controlMode]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex w-full max-w-sm shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">صندوق المحادثات</h1>
        <Link href="/dashboard/inbox/quick-replies" className="text-xs text-accent-400 hover:underline">
          ⚡ الردود السريعة
        </Link>
      </div>

      <input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && updateParam("q", searchInput)}
        onBlur={() => updateParam("q", searchInput)}
        className="input-field text-sm"
        placeholder="بحث بالاسم، الجوال، أو نص الرسالة..."
      />

      <div className="flex gap-2">
        <select value={assigneeId} onChange={(e) => updateParam("assigneeId", e.target.value)} className="input-field flex-1 !py-1.5 text-xs">
          <option value="">كل الأعضاء</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select value={controlMode} onChange={(e) => updateParam("controlMode", e.target.value)} className="input-field flex-1 !py-1.5 text-xs">
          <option value="">بوت أو موظف</option>
          <option value="BOT">🤖 البوت يتحكم</option>
          <option value="HUMAN">🙋 موظف يتحكم</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg bg-navy-800 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => updateParam("status", tab.value)}
            className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-center text-[11px] font-medium transition ${
              activeStatus === tab.value ? "bg-accent-500 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label} <span className="opacity-60">({counts[tab.value] ?? 0})</span>
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="rounded-lg border border-white/5 p-4 text-center text-sm text-slate-500">لا توجد محادثات في هذا التصنيف</p>
        )}
        {conversations.map((c) => (
          <Link key={c.id} href={`/dashboard/inbox/${c.id}`} className="block rounded-lg border border-white/5 bg-navy-800 p-3 hover:bg-navy-700">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
                {c.contact.name}
                {c.controlMode === "BOT" && <span title="البوت يتحكم">🤖</span>}
              </span>
              <span className={`text-xs ${c.isSlaBreached ? "font-semibold text-danger-500" : "text-slate-500"}`}>
                {c.isSlaBreached && "⏰ "}
                {new Date(c.lastMessageAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{c.lastMessageBody ?? "لا توجد رسائل"}</p>
            {c.assignedAgentName && <p className="mt-1 text-[10px] text-accent-400">👤 {c.assignedAgentName}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
