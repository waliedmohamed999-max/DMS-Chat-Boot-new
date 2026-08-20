"use client";

import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 3000; // نفس فترة InboxLivePoller.tsx بالضبط
const MAX_RECORDING_MS = 60_000;

type SenderType = "VISITOR" | "AI" | "STAFF";
type SessionStatus = "OPEN" | "HANDED_OFF" | "CLOSED";

type ChatMessage = { id: string; senderType: SenderType; text: string; createdAt: string };

function Bubble({ message }: { message: ChatMessage }) {
  const isVisitor = message.senderType === "VISITOR";
  return (
    <div className={`flex ${isVisitor ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-xl2 px-3 py-2 text-sm ${
          isVisitor ? "bg-wa-500 text-white" : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
        }`}
      >
        {message.senderType === "STAFF" && (
          <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide opacity-70">فريق الدعم</p>
        )}
        <p className="whitespace-pre-wrap">{message.text}</p>
      </div>
    </div>
  );
}

/** فقاعة شات عامة منفصلة عن FloatingWhatsAppButton (bottom-right، بلا تسجيل دخول، بلا كوكي — الجلسة
 * تعيش في state محلي فقط وتنتهي بإغلاق التبويب عمداً، بساطة مرحلة أولى). */
export function ChatWidget({ enabled }: { enabled: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("OPEN");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingLocal, setPendingLocal] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastMessageIdRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ensureSession(): Promise<string | null> {
    if (sessionId) return sessionId;
    try {
      const res = await fetch("/api/platform-chat/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setSessionId(data.sessionId);
      return data.sessionId as string;
    } catch {
      setError("تعذّر بدء المحادثة — حاول مرة أخرى");
      return null;
    }
  }

  async function poll(sid: string) {
    try {
      const url = `/api/platform-chat/${sid}/messages${lastMessageIdRef.current ? `?after=${lastMessageIdRef.current}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSessionStatus(data.status);
      const newMessages: ChatMessage[] = data.messages ?? [];
      const lastNew = newMessages[newMessages.length - 1];
      if (lastNew) {
        setMessages((prev) => [...prev, ...newMessages]);
        setPendingLocal([]); // الرسائل المؤقتة استُبدلت الآن بنسخها الحقيقية القادمة من الخادم
        lastMessageIdRef.current = lastNew.id;
      }
    } catch {
      // فشل شبكي عابر — يُعاد المحاولة في الدورة التالية دون إظهار خطأ للزائر
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    (async () => {
      const sid = await ensureSession();
      if (!sid || cancelled) return;
      await poll(sid);
    })();

    const interval = setInterval(() => {
      if (sessionId) poll(sessionId);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pendingLocal]);

  async function sendText() {
    const text = input.trim();
    if (!text || isSending) return;
    setError(null);
    const sid = await ensureSession();
    if (!sid) return;

    setInput("");
    setIsSending(true);
    setPendingLocal((prev) => [...prev, { id: `local-${Date.now()}`, senderType: "VISITOR", text, createdAt: new Date().toISOString() }]);

    try {
      const res = await fetch("/api/platform-chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "تعذّر إرسال الرسالة");
      } else if (data.sessionStatus) {
        setSessionStatus(data.sessionStatus);
      }
    } catch {
      setError("تعذّر إرسال الرسالة — تأكد من الاتصال");
    } finally {
      await poll(sid);
      setIsSending(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
        void uploadRecording();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      recordingTimeoutRef.current = setTimeout(() => recorder.stop(), MAX_RECORDING_MS);
    } catch {
      setError("تعذّر الوصول للميكروفون — تحقق من إذن المتصفح");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  async function uploadRecording() {
    setIsRecording(false);
    const sid = await ensureSession();
    if (!sid) return;
    const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
    if (blob.size === 0) return;

    setIsSending(true);
    try {
      const formData = new FormData();
      formData.set("sessionId", sid);
      formData.set("audio", blob, "voice.webm");
      const res = await fetch("/api/platform-chat/voice", { method: "POST", body: formData });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "تعذّر معالجة الرسالة الصوتية");
        return;
      }

      const contentType = res.headers.get("Content-Type") ?? "";
      if (contentType.includes("audio/")) {
        const status = res.headers.get("X-Session-Status");
        if (status) setSessionStatus(status as SessionStatus);
        const audioBlob = await res.blob();
        const url = URL.createObjectURL(audioBlob);
        if (audioPlayerRef.current) {
          audioPlayerRef.current.src = url;
          void audioPlayerRef.current.play().catch(() => {});
        }
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.sessionStatus) setSessionStatus(data.sessionStatus);
      }
    } catch {
      setError("تعذّر إرسال الرسالة الصوتية");
    } finally {
      await poll(sid);
      setIsSending(false);
    }
  }

  if (!enabled) return null;

  return (
    <>
      <audio ref={audioPlayerRef} className="hidden" />

      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label="محادثة مباشرة"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-2xl text-white shadow-lg transition hover:scale-105 hover:bg-accent-600"
      >
        {isOpen ? "✕" : "💬"}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[480px] w-[340px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 bg-accent-500 px-4 py-3 text-white dark:border-white/10">
            <p className="text-sm font-semibold">محادثة مباشرة</p>
            <button onClick={() => setIsOpen(false)} aria-label="إغلاق" className="text-lg leading-none opacity-90 hover:opacity-100">✕</button>
          </div>

          {sessionStatus === "HANDED_OFF" && (
            <div className="border-b border-warning-500/20 bg-warning-500/10 px-3 py-2 text-center text-xs font-medium text-warning-600 dark:text-warning-400">
              محادثتك مع فريق الدعم الآن
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && pendingLocal.length === 0 && (
              <p className="text-center text-sm text-slate-400">اكتب رسالتك أو سجّل رسالة صوتية للبدء...</p>
            )}
            {[...messages, ...pendingLocal].map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
            {isSending && <p className="text-center text-xs text-slate-400">جارٍ الكتابة...</p>}
          </div>

          {error && <p className="border-t border-danger-500/20 bg-danger-500/5 px-3 py-1.5 text-xs text-danger-500">{error}</p>}

          <div className="flex items-center gap-2 border-t border-slate-100 p-2.5 dark:border-white/10">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              aria-label={isRecording ? "إيقاف التسجيل" : "تسجيل رسالة صوتية"}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                isRecording ? "animate-pulse bg-danger-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              🎙️
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendText()}
              placeholder="اكتب رسالتك..."
              disabled={isSending || isRecording}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
            <button
              onClick={sendText}
              disabled={isSending || isRecording || !input.trim()}
              className="shrink-0 rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50"
            >
              إرسال
            </button>
          </div>
        </div>
      )}
    </>
  );
}
