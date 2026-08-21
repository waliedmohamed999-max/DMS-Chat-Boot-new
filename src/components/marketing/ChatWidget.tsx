"use client";

import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 3000; // نفس فترة InboxLivePoller.tsx بالضبط
const MAX_RECORDING_MS = 60_000;
// حد صارم مُطبَّق من العميل (JS) — خط دفاع أول فقط، وليس ضماناً مطلقاً (يمكن تجاوزه بتلاعب بالمتصفح).
// الحد الحقيقي الصارم هو حد المعدل العام في /api/platform-chat/realtime-token (مُطبَّق من الخادم).
const CALL_DURATION_SECONDS = 300;

type SenderType = "VISITOR" | "AI" | "STAFF";
type SessionStatus = "OPEN" | "HANDED_OFF" | "CLOSED";

type ChatMessage = { id: string; senderType: SenderType; text: string; createdAt: string };

// واجهة مبسَّطة لـWeb Speech API (SpeechRecognition) — ليست في مكتبات TS القياسية (API غير موحَّد
// عبر المتصفحات)، فنعرّف هنا فقط الحقول/الأحداث المستخدَمة فعلياً بدل الاعتماد على أنواع خارجية.
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

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
export function ChatWidget({ enabled, voiceCallEnabled, demoMode }: { enabled: boolean; voiceCallEnabled: boolean; demoMode: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("OPEN");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingLocal, setPendingLocal] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [callSecondsLeft, setCallSecondsLeft] = useState(CALL_DURATION_SECONDS);
  const [callError, setCallError] = useState<string | null>(null);
  // متفائل افتراضياً (true) لتفادي عدم تطابق hydration — السيرفر لا يعرف قدرات المتصفح، فيُصحَّح
  // القيمة الفعلية بعد التركيب عبر useEffect أدناه (فحص متاح فقط في المتصفح).
  const [speechSupported, setSpeechSupported] = useState(true);

  const lastMessageIdRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // مكالمة WebRTC الحية — منفصلة تماماً عن audioPlayerRef (ذاك لتشغيل رد صوتي مُسجَّل مرة واحدة،
  // هذا لتدفق صوت حي مستمر من OpenAI؛ خلطهما يخاطر بتعارض .src مقابل .srcObject).
  const callAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // مسار العرض التجريبي المجاني (Web Speech API) — منفصل تماماً عن refs المسار الحقيقي أعلاه، بلا
  // أي تداخل بينهما (كل مسار يستخدم مجموعته فقط).
  const demoRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const demoCallRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const demoCallActiveRef = useRef(false);

  useEffect(() => {
    if (demoMode) setSpeechSupported(Boolean(getSpeechRecognitionCtor()));
  }, [demoMode]);

  async function ensureSession(): Promise<string | null> {
    if (sessionId) return sessionId;
    try {
      const res = await fetch("/api/platform-chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDemo: demoMode }),
      });
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

  // يضمن إغلاق الميكروفون والاتصال فعلياً لو أُزيل المكوّن (تنقّل لصفحة أخرى) أثناء مكالمة نشطة —
  // بلا هذا، الميكروفون كان سيبقى مفتوحاً في الخلفية بصمت.
  useEffect(() => {
    return () => {
      if (callIntervalRef.current) clearInterval(callIntervalRef.current);
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      dataChannelRef.current?.close();
      peerConnectionRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      demoCallActiveRef.current = false;
      demoCallRecognitionRef.current?.stop();
      demoRecognitionRef.current?.stop();
      if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    };
  }, []);

  async function sendText(overrideText?: string) {
    const text = (overrideText ?? input).trim();
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

  async function startRealRecording() {
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

  /** بديل مجاني كامل لوضع العرض التجريبي: تفريغ محلي في المتصفح عبر Web Speech API بدل رفع تسجيل
   * حقيقي لـ/api/platform-chat/voice (بلا أي استدعاء Whisper إطلاقاً). */
  function startDemoRecording() {
    setError(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("التعرّف الصوتي غير مدعوم في هذا المتصفح — جرّب Chrome");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "ar-SA";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) void sendText(transcript);
    };
    recognition.onerror = () => {
      setError("تعذّر التعرّف على الصوت — جرّب مرة أخرى");
      setIsRecording(false);
    };
    recognition.onend = () => setIsRecording(false);
    demoRecognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  }

  function startRecording() {
    if (demoMode) return startDemoRecording();
    return startRealRecording();
  }

  function stopRecording() {
    if (demoMode) {
      demoRecognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
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

  /** يخزّن جزءاً مكتملاً من نص المكالمة (زائر أو مساعد) — الاستطلاع الدوري الموجود بالفعل (useEffect
   * أعلاه) يلتقطه تلقائياً ويعرضه، بلا حاجة لتحديث state هنا مباشرة. */
  async function sendVoiceTranscript(sid: string, role: "visitor" | "ai", text: string) {
    try {
      await fetch(`/api/platform-chat/${sid}/voice-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, text }),
      });
    } catch {
      // فشل تسجيل نص المكالمة لا يوقف المكالمة نفسها — مجرد سجل مفقود لهذا الجزء
    }
  }

  function handleRealtimeEvent(event: { type?: string; transcript?: string }, sid: string | null) {
    if (!sid || !event?.transcript) return;
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      void sendVoiceTranscript(sid, "visitor", event.transcript);
    } else if (event.type === "response.output_audio_transcript.done") {
      void sendVoiceTranscript(sid, "ai", event.transcript);
    }
  }

  function cleanupCall() {
    if (callIntervalRef.current) clearInterval(callIntervalRef.current);
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callIntervalRef.current = null;
    callTimeoutRef.current = null;

    // تنظيف مسار WebRTC الحقيقي — كل الـrefs تبقى null أصلاً في وضع العرض التجريبي فلا أثر لها هناك.
    dataChannelRef.current?.close();
    peerConnectionRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (callAudioRef.current) callAudioRef.current.srcObject = null;
    dataChannelRef.current = null;
    peerConnectionRef.current = null;
    localStreamRef.current = null;

    // تنظيف مسار العرض التجريبي (Web Speech API) — لا أثر له في المسار الحقيقي.
    demoCallActiveRef.current = false;
    demoCallRecognitionRef.current?.stop();
    demoCallRecognitionRef.current = null;
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();

    setIsCalling(false);
  }

  async function endCall() {
    const sid = sessionId;
    cleanupCall();
    if (sid) await sendVoiceTranscript(sid, "ai", "[انتهت المكالمة الصوتية]");
  }

  function speakText(text: string, onEnd: () => void) {
    if (!isSpeechSynthesisSupported()) {
      onEnd();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ar-SA";
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
    window.speechSynthesis.speak(utterance);
  }

  /** دورة استماع→رد→نطق→استماع محلية بالكامل عبر Web Speech API — بلا أي WebRTC أو realtime-token
   * إطلاقاً، الرد النصي يمر عبر نفس /api/platform-chat/message العادية (اللي تستخدم بدورها
   * demoReplyEngine.ts تلقائياً لأن الجلسة isDemo). */
  function startDemoListenCycle(sid: string) {
    if (!demoCallActiveRef.current) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "ar-SA";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript || !demoCallActiveRef.current) return;
      void (async () => {
        void sendVoiceTranscript(sid, "visitor", transcript);
        const res = await fetch("/api/platform-chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid, text: transcript }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        if (data.sessionStatus) setSessionStatus(data.sessionStatus);
        const replyText = typeof data.replyText === "string" ? data.replyText : null;
        if (replyText) void sendVoiceTranscript(sid, "ai", replyText);
        if (demoCallActiveRef.current) {
          if (replyText) speakText(replyText, () => startDemoListenCycle(sid));
          else startDemoListenCycle(sid); // لا رد نصي (تحويل مثلاً) — استأنف الاستماع مباشرة
        }
      })();
    };
    recognition.onerror = () => {
      if (demoCallActiveRef.current) startDemoListenCycle(sid); // خطأ عابر (صمت طويل مثلاً) — استأنف
    };
    demoCallRecognitionRef.current = recognition;
    recognition.start();
  }

  async function startDemoCall() {
    setCallError(null);
    if (!getSpeechRecognitionCtor() || !isSpeechSynthesisSupported()) {
      setCallError("المحادثة الصوتية التجريبية غير مدعومة في هذا المتصفح — جرّب Chrome");
      return;
    }
    const sid = await ensureSession();
    if (!sid) return;

    demoCallActiveRef.current = true;
    setIsCalling(true);
    setCallSecondsLeft(CALL_DURATION_SECONDS);
    callIntervalRef.current = setInterval(() => {
      setCallSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    callTimeoutRef.current = setTimeout(() => void endCall(), CALL_DURATION_SECONDS * 1000);

    startDemoListenCycle(sid);
  }

  async function startCall() {
    if (demoMode) return startDemoCall();

    setCallError(null);
    const sid = await ensureSession();

    try {
      const tokenRes = await fetch("/api/platform-chat/realtime-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) {
        setCallError(tokenData.error || "تعذّر بدء المكالمة الصوتية");
        return;
      }
      const clientSecret = tokenData.clientSecret as string;

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (callAudioRef.current) {
          callAudioRef.current.srcObject = event.streams[0] ?? null;
          void callAudioRef.current.play().catch(() => {});
        }
      };

      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;
      dc.onmessage = (event) => {
        try {
          handleRealtimeEvent(JSON.parse(event.data), sid);
        } catch {
          // حدث غير قابل للتحليل — تجاهل بأمان
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // تبادل SDP مباشرة مع OpenAI (الصوت الحي لا يمر عبر خادمنا إطلاقاً) — راجع تعليق
      // mintRealtimeClientSecret في openaiClient.ts لملاحظة أن نقطة النهاية هذه (`/v1/realtime/calls`)
      // تحديداً قابلة للتغيّر مستقبلاً حسب توثيق OpenAI.
      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!sdpRes.ok) throw new Error("sdp exchange failed");
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setIsCalling(true);
      setCallSecondsLeft(CALL_DURATION_SECONDS);
      callIntervalRef.current = setInterval(() => {
        setCallSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      // مؤقّت صارم منفصل عن العدّاد المرئي أعلاه — يضمن القطع الفعلي حتى لو تجمّد تحديث الـstate.
      callTimeoutRef.current = setTimeout(() => void endCall(), CALL_DURATION_SECONDS * 1000);
    } catch {
      setCallError("تعذّر الاتصال — تحقق من إذن الميكروفون واتصالك بالإنترنت");
      cleanupCall();
    }
  }

  if (!enabled) return null;

  const callMinutes = Math.floor(callSecondsLeft / 60);
  const callSecondsPart = String(callSecondsLeft % 60).padStart(2, "0");

  return (
    <>
      <audio ref={audioPlayerRef} className="hidden" />
      <audio ref={callAudioRef} className="hidden" />

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

          {isCalling && (
            <div className="flex items-center justify-between border-b border-white/10 bg-slate-900 px-3 py-2 text-white">
              <span className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 animate-pulse rounded-full bg-danger-500" />
                مكالمة صوتية جارية · <span dir="ltr">{callMinutes}:{callSecondsPart}</span>
              </span>
              <button onClick={() => void endCall()} className="rounded-md bg-danger-500 px-2 py-1 text-xs font-semibold hover:bg-danger-600">
                إنهاء المكالمة
              </button>
            </div>
          )}

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
          {callError && <p className="border-t border-danger-500/20 bg-danger-500/5 px-3 py-1.5 text-xs text-danger-500">{callError}</p>}

          <div className="flex items-center gap-2 border-t border-slate-100 p-2.5 dark:border-white/10">
            {voiceCallEnabled && (
              <button
                onClick={isCalling ? () => void endCall() : () => void startCall()}
                disabled={isSending || isRecording || (demoMode && !speechSupported)}
                title={demoMode && !speechSupported ? "غير مدعوم في هذا المتصفح — جرّب Chrome" : undefined}
                aria-label={isCalling ? "إنهاء المكالمة" : "اتصال صوتي"}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 ${
                  isCalling ? "animate-pulse bg-danger-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                📞
              </button>
            )}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isCalling || (demoMode && !speechSupported)}
              title={demoMode && !speechSupported ? "غير مدعوم في هذا المتصفح — جرّب Chrome" : undefined}
              aria-label={isRecording ? "إيقاف التسجيل" : "تسجيل رسالة صوتية"}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 ${
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
              disabled={isSending || isRecording || isCalling}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
            <button
              onClick={() => sendText()}
              disabled={isSending || isRecording || isCalling || !input.trim()}
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
