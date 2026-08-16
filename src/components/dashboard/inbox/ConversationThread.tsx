"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MessageBubble, type MessageBubbleData } from "@/components/dashboard/inbox/MessageBubble";
import { sendReply, sendTemplateReply } from "@/app/dashboard/inbox/actions";
import { computeWindowState } from "@/lib/inbox/windowState";

type QuickReplyItem = { id: string; shortcut: string; body: string };
type TemplateItem = { id: string; name: string; bodyText: string };

export function ConversationThread({
  conversationId,
  messages,
  sessionWindowExpiresAt,
  quickReplies,
  approvedTemplates,
}: {
  conversationId: string;
  messages: MessageBubbleData[];
  sessionWindowExpiresAt: string | null;
  quickReplies: QuickReplyItem[];
  approvedTemplates: TemplateItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<MessageBubbleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(approvedTemplates[0]?.id ?? "");
  const formRef = useRef<HTMLFormElement>(null);

  const [windowState, setWindowState] = useState(() =>
    computeWindowState(sessionWindowExpiresAt ? new Date(sessionWindowExpiresAt) : null)
  );
  useEffect(() => {
    const expiry = sessionWindowExpiresAt ? new Date(sessionWindowExpiresAt) : null;
    setWindowState(computeWindowState(expiry));
    const interval = setInterval(() => setWindowState(computeWindowState(expiry)), 30000);
    return () => clearInterval(interval);
  }, [sessionWindowExpiresAt]);
  const { isOpen: windowOpen, hoursRemaining, minutesRemaining } = windowState;

  const quickReplyMatches = useMemo(() => {
    if (!body.startsWith("/") || body.length < 1) return [];
    const query = body.slice(1).toLowerCase();
    return quickReplies.filter((q) => q.shortcut.toLowerCase().startsWith(query)).slice(0, 5);
  }, [body, quickReplies]);

  function handleSubmit(formData: FormData) {
    setError(null);
    if (replyingTo) formData.set("quotedMessageId", replyingTo.id);
    startTransition(async () => {
      try {
        await sendReply(conversationId, formData);
        setBody("");
        setReplyingTo(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّر إرسال الرد");
      }
    });
  }

  function handleSendTemplate() {
    if (!templateId) return;
    setError(null);
    startTransition(async () => {
      try {
        await sendTemplateReply(conversationId, templateId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّر إرسال القالب");
      }
    });
  }

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className="group relative">
            <MessageBubble message={m} />
            {m.direction === "INBOUND" && (
              <button
                onClick={() => setReplyingTo(m)}
                className="absolute -top-1 left-0 hidden rounded bg-navy-900 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white group-hover:block"
              >
                ↩️ رد
              </button>
            )}
          </div>
        ))}
        {messages.length === 0 && <p className="text-center text-sm text-slate-500">لا توجد رسائل بعد.</p>}
      </div>

      <div className="border-t border-white/5 p-4">
        {error && <p className="mb-2 rounded-lg bg-danger-500/10 px-3 py-2 text-xs text-danger-500">{error}</p>}

        {windowOpen ? (
          <>
            <p className="mb-2 text-[11px] text-slate-500" dir="ltr">
              ⏱ متبقي {hoursRemaining} ساعة و{minutesRemaining} دقيقة للرد الحر ضمن نافذة الـ24 ساعة
            </p>
            {replyingTo && (
              <div className="mb-2 flex items-center justify-between rounded-lg border-r-2 border-accent-500 bg-navy-900 px-3 py-1.5 text-xs text-slate-300">
                <span className="truncate">↩️ رد على: {replyingTo.body.slice(0, 60)}</span>
                <button onClick={() => setReplyingTo(null)} className="text-slate-500 hover:text-white">✕</button>
              </div>
            )}
            <form ref={formRef} action={handleSubmit} className="relative flex gap-2">
              <input
                name="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                className="input-field flex-1"
                placeholder="اكتب رداً... (اكتب / لعرض الردود السريعة)"
                autoComplete="off"
              />
              <button type="submit" disabled={isPending} className="btn-primary">
                إرسال
              </button>
              {quickReplyMatches.length > 0 && (
                <div className="absolute bottom-full right-0 mb-1 w-full rounded-lg border border-white/10 bg-navy-800 shadow-lg">
                  {quickReplyMatches.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setBody(q.body)}
                      className="block w-full px-3 py-2 text-right text-xs text-slate-200 hover:bg-white/5"
                    >
                      <span className="text-accent-400">/{q.shortcut}</span> — {q.body.slice(0, 50)}
                    </button>
                  ))}
                </div>
              )}
            </form>
          </>
        ) : (
          <div>
            <p className="mb-2 rounded-lg bg-warning-500/10 px-3 py-2 text-xs text-warning-500">
              ⚠️ انتهت نافذة الـ24 ساعة — يمكن الرد فقط عبر قالب رسالة معتمد من Meta.
            </p>
            {approvedTemplates.length > 0 ? (
              <div className="flex gap-2">
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input-field flex-1 text-sm">
                  {approvedTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button onClick={handleSendTemplate} disabled={isPending} className="btn-primary text-sm">
                  إرسال القالب
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">لا توجد قوالب معتمدة بعد — أضف قالباً من صفحة قوالب الرسائل.</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
