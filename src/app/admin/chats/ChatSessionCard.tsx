"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { takeOverSession, sendStaffReply } from "./actions";

type SenderType = "VISITOR" | "AI" | "STAFF";
type SessionStatus = "OPEN" | "HANDED_OFF";

export type ChatSessionSummary = {
  id: string;
  status: SessionStatus;
  visitorName: string | null;
  visitorEmail: string | null;
  assignedTo: { id: string; name: string } | null;
  lastMessageAt: string;
  messages: { id: string; senderType: SenderType; text: string; createdAt: string }[];
};

const STATUS_BADGE: Record<SessionStatus, { label: string; className: string }> = {
  OPEN: { label: "الموظف الذكي يرد", className: "bg-accent-500/10 text-accent-400" },
  HANDED_OFF: { label: "مُحوَّلة لفريق الدعم", className: "bg-warning-500/10 text-warning-500" },
};

const SENDER_LABEL: Record<SenderType, string> = { VISITOR: "الزائر", AI: "الموظف الذكي", STAFF: "أنت" };

export function ChatSessionCard({ session }: { session: ChatSessionSummary }) {
  const [messages, setMessages] = useState(session.messages);
  const [status, setStatus] = useState<SessionStatus>(session.status);
  const [assignedTo, setAssignedTo] = useState(session.assignedTo);
  const [replyText, setReplyText] = useState("");
  const [isPending, startTransition] = useTransition();

  const lastMessageIdRef = useRef<string | null>(messages.length ? messages[messages.length - 1]?.id ?? null : null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const url = `/api/platform-chat/${session.id}/messages${lastMessageIdRef.current ? `?after=${lastMessageIdRef.current}` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status) setStatus(data.status);
        const newMessages: ChatSessionSummary["messages"] = data.messages ?? [];
        const lastNew = newMessages[newMessages.length - 1];
        if (lastNew) {
          setMessages((prev) => [...prev, ...newMessages]);
          lastMessageIdRef.current = lastNew.id;
        }
      } catch {
        // فشل شبكي عابر — يُعاد المحاولة في الدورة التالية
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [session.id]);

  function handleTakeOver() {
    startTransition(() => takeOverSession(session.id));
    setStatus("HANDED_OFF");
  }

  function handleReply() {
    const text = replyText.trim();
    if (!text || isPending) return;
    setReplyText("");
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, senderType: "STAFF", text, createdAt: new Date().toISOString() }]);
    startTransition(() => sendStaffReply(session.id, text));
  }

  const badge = STATUS_BADGE[status];

  return (
    <div className="card flex flex-col p-5">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="font-semibold text-white">{session.visitorName || "زائر مجهول"}</p>
          <p className="text-xs text-slate-500" dir="ltr">
            {session.visitorEmail || "—"}
            {assignedTo && <span dir="rtl"> · معيَّنة لـ{assignedTo.name}</span>}
          </p>
        </div>
        <span className={`badge ${badge.className}`}>{badge.label}</span>
      </div>

      <div className="mb-3 max-h-56 space-y-2 overflow-y-auto rounded-lg bg-navy-900 p-3">
        {messages.length === 0 && <p className="text-center text-xs text-slate-500">لا توجد رسائل بعد.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.senderType === "VISITOR" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${
                m.senderType === "VISITOR" ? "bg-navy-700 text-slate-200" : m.senderType === "STAFF" ? "bg-accent-500 text-white" : "bg-white/10 text-slate-300"
              }`}
            >
              <p className="mb-0.5 opacity-60">{SENDER_LABEL[m.senderType]}</p>
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        {status === "OPEN" && (
          <button onClick={handleTakeOver} disabled={isPending} className="btn-secondary text-xs">
            🙋 تولّي المحادثة
          </button>
        )}
        <div className="flex gap-2">
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleReply()}
            placeholder="اكتب رداً كموظف دعم..."
            disabled={isPending}
            className="input-field flex-1 text-xs"
          />
          <button onClick={handleReply} disabled={isPending || !replyText.trim()} className="btn-primary text-xs">
            إرسال
          </button>
        </div>
      </div>
    </div>
  );
}
