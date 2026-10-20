"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addTextKnowledge, addUrlKnowledge, answerGap, approveSuggestion, deleteKnowledge, deleteQaAction, deleteSiteAction, extractQaFromSource, recrawlSite, reindexQas, reprocessKnowledge,
  saveBrainSettings, saveQa, testBrain, type BrainActionResult, type BrainTestResult,
} from "./actions";

function Result({ state }: { state: BrainActionResult }) {
  return state ? <span className={`text-xs ${state.ok ? "text-success-500" : "text-danger-500"}`}>{state.message}</span> : null;
}

// ========================= الإعدادات =========================

export function BrainSettingsForm({ values }: { values: { directAnswers: boolean; rememberCustomers: boolean; learnFromAgents: boolean } }) {
  const [state, action, pending] = useActionState(saveBrainSettings, null);
  const items = [
    { name: "directAnswers", label: "رد مباشر من الإجابات المعتمدة", hint: "سؤال مطابق لإجابة محفوظة يُرد عليه فوراً بلا ذكاء اصطناعي (صفر توكنز)" },
    { name: "rememberCustomers", label: "تذكّر معلومات العملاء", hint: "يحفظ البوت تفضيلات كل عميل (المدينة، المقاس...) ويستخدمها في المحادثات القادمة" },
    { name: "learnFromAgents", label: "التعلّم من ردود فريقك", hint: "رد موظفك بعد التحويل يصبح إجابة مقترحة تعتمدها أنت" },
  ] as const;
  return (
    <form action={action} className="space-y-3">
      {items.map((i) => (
        <label key={i.name} className="flex items-start gap-2 text-sm text-slate-200">
          <input type="checkbox" name={i.name} defaultChecked={values[i.name]} className="mt-1 h-4 w-4" />
          <span>
            {i.label}
            <span className="block text-xs text-slate-500">{i.hint}</span>
          </span>
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-secondary text-sm disabled:opacity-50">{pending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}

// ========================= إضافة معرفة =========================

const TABS = [
  { key: "qa", label: "سؤال وجواب" },
  { key: "text", label: "نص" },
  { key: "url", label: "رابط / موقع" },
  { key: "file", label: "ملف" },
  { key: "import", label: "استيراد أسئلة (Excel)" },
] as const;

export function AddKnowledge() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("qa");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === t.key ? "bg-accent-500/20 text-accent-300" : "bg-white/5 text-slate-400 hover:text-slate-200"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "qa" && <QaForm />}
      {tab === "text" && <TextForm />}
      {tab === "url" && <UrlForm />}
      {tab === "file" && <UploadForm mode="source" />}
      {tab === "import" && <UploadForm mode="qa" />}
    </div>
  );
}

function TextForm() {
  const [v, setV] = useState({ title: "", text: "" });
  const [state, action, pending] = useActionState(async (prev: BrainActionResult, fd: FormData) => {
    const r = await addTextKnowledge(prev, fd);
    if (r?.ok) setV({ title: "", text: "" });
    return r;
  }, null);
  return (
    <form action={action} className="space-y-3">
      <input name="title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} className="input-field" placeholder="عنوان (مثال: سياسة الضمان)" maxLength={200} />
      <textarea
        name="text" value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} rows={8} required className="input-field text-sm"
        placeholder="الصق أي معلومات عن متجرك: الخدمات، المقاسات، طرق الدفع، الضمان، مواعيد التوصيل لكل مدينة..."
      />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary text-sm disabled:opacity-50">{pending ? "جارٍ الفهرسة…" : "إضافة للعقل"}</button>
        <span className="text-xs text-slate-500" dir="ltr">{v.text.length.toLocaleString()} chars</span>
        <Result state={state} />
      </div>
    </form>
  );
}

function UrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"page" | "site">("site");
  const [state, action, pending] = useActionState(async (prev: BrainActionResult, fd: FormData) => {
    const r = await addUrlKnowledge(prev, fd);
    if (r?.ok) {
      setUrl("");
      router.refresh();
    }
    return r;
  }, null);
  return (
    <form action={action} className="space-y-3">
      <input name="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required className="input-field" dir="ltr" placeholder="https://mystore.com" />
      <div className="flex flex-wrap gap-4 text-sm text-slate-300">
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="site" checked={mode === "site"} onChange={() => setMode("site")} /> 🌐 الموقع / المتجر كاملاً
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="page" checked={mode === "page"} onChange={() => setMode("page")} /> 📄 هذه الصفحة فقط
        </label>
      </div>
      <p className="text-xs text-slate-500">
        {mode === "site"
          ? "نقرأ خريطة موقعك وصفحاته (حتى 40 صفحة، الأهم أولاً: الأسئلة الشائعة، الشحن، الاسترجاع، التواصل)، مع المنتجات والأسعار وبيانات التواصل المنشورة في الصفحات. يعمل بالخلفية ويتحدّث أسبوعياً."
          : "صفحة واحدة: سياسة، صفحة منتج، أو مستند Google Docs / جدول Google Sheets عام (مشاركة: أي شخص لديه الرابط)."}
      </p>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary text-sm disabled:opacity-50">
          {pending ? "جارٍ البدء…" : mode === "site" ? "اسحب بيانات الموقع" : "جلب الصفحة"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

function UploadForm({ mode }: { mode: "source" | "qa" }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [state, setState] = useState<BrainActionResult>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const file = input.current?.files?.[0];
        if (!file) return setState({ ok: false, message: "اختر ملفاً" });
        start(async () => {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("mode", mode);
          const res = await fetch("/api/ai-agent/brain/upload", { method: "POST", body: fd }).catch(() => null);
          const body = res ? await res.json().catch(() => null) : null;
          setState(body ?? { ok: false, message: "تعذّر الرفع" });
          if (body?.ok) {
            if (input.current) input.current.value = "";
            router.refresh();
          }
        });
      }}
    >
      <input ref={input} type="file" accept={mode === "qa" ? ".xlsx,.csv" : ".pdf,.txt,.md,.csv"} className="block text-sm text-slate-300" />
      <p className="text-xs text-slate-500">
        {mode === "qa"
          ? "ملف Excel أو CSV: العمود الأول السؤال، الثاني الجواب (حتى 500 سؤال). السؤال الموجود يُحدَّث جوابه."
          : "PDF أو نص أو CSV حتى 10MB (ملفات PDF الممسوحة ضوئياً بلا نص لا تُقرأ — الصق نصها بدلاً منها)."}
      </p>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary text-sm disabled:opacity-50">{pending ? "جارٍ المعالجة…" : mode === "qa" ? "استيراد الأسئلة" : "رفع وفهرسة"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}

// ========================= الأسئلة والأجوبة =========================

export function QaForm({ initial, onDone }: { initial?: { id: string; question: string; answer: string; directReply: boolean }; onDone?: () => void }) {
  const [state, action, pending] = useActionState(async (prev: BrainActionResult, fd: FormData) => {
    const r = await saveQa(prev, fd);
    if (r?.ok) {
      if (!initial) setV({ question: "", answer: "", directReply: true });
      onDone?.();
    }
    return r;
  }, null);
  const [v, setV] = useState({ question: initial?.question ?? "", answer: initial?.answer ?? "", directReply: initial?.directReply ?? true });
  return (
    <form action={action} className="space-y-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input name="question" value={v.question} onChange={(e) => setV({ ...v, question: e.target.value })} required maxLength={500} className="input-field" placeholder="السؤال كما يكتبه العميل (مثال: كم يوم التوصيل للرياض؟)" />
      <textarea name="answer" value={v.answer} onChange={(e) => setV({ ...v, answer: e.target.value })} required maxLength={2000} rows={3} className="input-field text-sm" placeholder="الجواب الذي يُرسل للعميل" />
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" name="directReply" checked={v.directReply} onChange={(e) => setV({ ...v, directReply: e.target.checked })} className="h-4 w-4" />
        أرسل هذا الجواب حرفياً عند تطابق السؤال (بلا ذكاء اصطناعي)
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary text-sm disabled:opacity-50">{pending ? "جارٍ الحفظ…" : initial ? "حفظ" : "إضافة السؤال"}</button>
        {initial && onDone && <button type="button" onClick={onDone} className="text-xs text-slate-400 hover:underline">إلغاء</button>}
        <Result state={state} />
      </div>
    </form>
  );
}

export function QaItem({ qa }: { qa: { id: string; question: string; answer: string; directReply: boolean; hits: number; origin: string } }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [state, setState] = useState<BrainActionResult>(null);
  if (editing) return <div className="rounded-lg bg-white/5 p-3"><QaForm initial={qa} onDone={() => setEditing(false)} /></div>;
  return (
    <div className="rounded-lg bg-white/5 p-3">
      <p className="text-sm font-medium text-slate-100">س: {qa.question}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">ج: {qa.answer}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {qa.directReply ? <span className="badge bg-success-500/10 text-success-500">رد مباشر</span> : <span className="badge bg-white/5 text-slate-400">مرجع للذكاء الاصطناعي</span>}
        {qa.hits > 0 && <span>استُخدم {qa.hits} مرة</span>}
        {qa.origin === "FROM_REVIEW" && <span>من تصحيح مراجعة</span>}
        {qa.origin === "FROM_AGENT" && <span>من رد الفريق</span>}
        <span className="flex-1" />
        <button type="button" onClick={() => setEditing(true)} className="text-accent-400 hover:underline">تعديل</button>
        <button
          type="button" disabled={pending} className="text-danger-500 hover:underline disabled:opacity-50"
          onClick={() => confirm("حذف هذا السؤال من العقل؟") && start(async () => setState(await deleteQaAction(qa.id)))}
        >
          حذف
        </button>
        <Result state={state} />
      </div>
    </div>
  );
}

export function SuggestionItem({ qa }: { qa: { id: string; question: string; answer: string; origin: string } }) {
  const [state, action, pending] = useActionState(approveSuggestion, null);
  const [v, setV] = useState({ question: qa.question, answer: qa.answer });
  const [rejecting, start] = useTransition();
  return (
    <form action={action} className="space-y-2 rounded-lg border border-warning-500/20 bg-warning-500/5 p-3">
      <input type="hidden" name="id" value={qa.id} />
      <span className="text-[11px] text-slate-500">
        {qa.origin === "GENERATED" ? "✨ مستخرج بالذكاء الاصطناعي من مصادرك" : qa.origin === "FROM_WEBSITE" ? "🌐 من الأسئلة الشائعة في موقعك" : "👤 من رد فريقك بعد تحويل"}
      </span>
      <input name="question" value={v.question} onChange={(e) => setV({ ...v, question: e.target.value })} className="input-field text-sm" />
      <textarea name="answer" value={v.answer} onChange={(e) => setV({ ...v, answer: e.target.value })} rows={2} className="input-field text-sm" />
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" name="directReply" defaultChecked className="h-4 w-4" /> رد مباشر عند التطابق
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary text-xs disabled:opacity-50">اعتماد</button>
        <button type="button" disabled={rejecting} onClick={() => start(async () => void (await deleteQaAction(qa.id)))} className="text-xs text-slate-400 hover:underline">تجاهل</button>
        <Result state={state} />
      </div>
    </form>
  );
}

// ========================= سحب المواقع =========================

type CrawlState = {
  status: "running" | "done" | "failed"; rootUrl: string; discovered: number; processed: number;
  added: number; updated: number; unchanged: number; faqs: number; stoppedReason?: string; error?: string;
};

/** حالة سحب الموقع الجاري/الأخير — تتحدّث تلقائياً كل 3 ثوانٍ أثناء السحب. */
export function CrawlStatus({ state }: { state: CrawlState | null }) {
  const router = useRouter();
  const running = state?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, router]);
  if (!state) return null;
  const host = (() => {
    try {
      return new URL(state.rootUrl).hostname;
    } catch {
      return state.rootUrl;
    }
  })();
  return (
    <div className={`card p-4 text-sm ${running ? "border border-accent-500/30" : state.status === "failed" ? "border border-danger-500/30" : "border border-success-500/30"}`}>
      <p className="font-semibold text-white">
        {running ? `🌐 جارٍ سحب ${host}…` : state.status === "failed" ? `❌ تعذّر سحب ${host}` : `✅ اكتمل سحب ${host}`}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        قُرئت {state.processed} صفحة{running && state.discovered ? ` من ~${state.discovered}` : ""} · جديدة {state.added} · محدَّثة {state.updated} · بلا تغيير {state.unchanged}
        {state.faqs ? ` · ${state.faqs} سؤال شائع من موقعك بانتظار اعتمادك` : ""}
      </p>
      {state.stoppedReason && <p className="mt-1 text-xs text-warning-500">توقف: {state.stoppedReason}</p>}
      {state.error && <p className="mt-1 text-xs text-danger-500">{state.error}</p>}
      {running && <div className="mt-2 h-1.5 overflow-hidden rounded bg-white/5"><div className="h-full animate-pulse bg-accent-500/60" style={{ width: `${Math.min(100, Math.round((state.processed / Math.max(1, state.discovered)) * 100))}%` }} /></div>}
    </div>
  );
}

export function SiteActions({ siteRoot }: { siteRoot: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<BrainActionResult>(null);
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <button type="button" disabled={pending} onClick={() => start(async () => { setState(await recrawlSite(siteRoot)); router.refresh(); })} className="text-accent-400 hover:underline disabled:opacity-50">
        🔄 إعادة سحب الموقع
      </button>
      <button
        type="button" disabled={pending} className="text-danger-500 hover:underline disabled:opacity-50"
        onClick={() => confirm("حذف كل صفحات هذا الموقع من العقل؟") && start(async () => setState(await deleteSiteAction(siteRoot)))}
      >
        حذف الموقع
      </button>
      <Result state={state} />
    </div>
  );
}

// ========================= فجوات المعرفة =========================

export function GapItem({ gap }: { gap: { question: string; count: number; examples: string[] } }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(answerGap, null);
  const [answer, setAnswer] = useState("");
  if (state?.ok) return <div className="rounded-lg bg-success-500/5 p-3 text-xs text-success-500">✅ {gap.question} — {state.message}</div>;
  return (
    <div className="rounded-lg bg-white/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-slate-100">{gap.question}</p>
          {gap.examples.length > 0 && <p className="mt-1 text-xs text-slate-500">صيغ أخرى: {gap.examples.join(" · ")}</p>}
        </div>
        <span className="badge shrink-0 bg-warning-500/10 text-warning-500">{gap.count}×</span>
      </div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs text-accent-400 hover:underline">✍️ أضف الإجابة</button>
      ) : (
        <form action={action} className="mt-2 space-y-2">
          <input type="hidden" name="question" value={gap.question} />
          <textarea name="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} required maxLength={2000} rows={2} className="input-field text-sm" placeholder="الجواب الصحيح…" />
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" name="directReply" defaultChecked className="h-4 w-4" /> رد مباشر عند التطابق
          </label>
          <div className="flex items-center gap-3">
            <button disabled={pending} className="btn-primary text-xs disabled:opacity-50">حفظ في العقل</button>
            <Result state={state} />
          </div>
        </form>
      )}
    </div>
  );
}

// ========================= المصادر =========================

export function SourceActions({ id, canRefresh, ready }: { id: string; canRefresh: boolean; ready: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<BrainActionResult>(null);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
      {ready && (
        <button type="button" disabled={pending} onClick={() => start(async () => setState(await extractQaFromSource(id)))} className="text-success-500 hover:underline disabled:opacity-50">
          {pending ? "…" : "✨ استخرج أسئلة"}
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => start(async () => setState(await reprocessKnowledge(id)))} className="text-accent-400 hover:underline disabled:opacity-50">
        {canRefresh ? "تحديث من الرابط" : "إعادة الفهرسة"}
      </button>
      <button
        type="button" disabled={pending} className="text-danger-500 hover:underline disabled:opacity-50"
        onClick={() => confirm("حذف هذا المصدر وكل مقاطعه من العقل؟") && start(async () => setState(await deleteKnowledge(id)))}
      >
        حذف
      </button>
      <Result state={state} />
    </div>
  );
}

export function ReindexButton() {
  const [pending, start] = useTransition();
  const [state, setState] = useState<BrainActionResult>(null);
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => setState(await reindexQas()))} className="btn-secondary text-xs disabled:opacity-50">
        {pending ? "جارٍ الفهرسة…" : "فهرسة الأسئلة للبحث الذكي"}
      </button>
      <Result state={state} />
    </span>
  );
}

// ========================= اختبار العقل =========================

export function TestBrainBox() {
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BrainTestResult | null>(null);
  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setResult(await testBrain(query)));
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} className="input-field flex-1" placeholder="اكتب سؤالاً كما يكتبه عميلك…" maxLength={500} />
        <button disabled={pending || !query.trim()} className="btn-secondary text-sm disabled:opacity-50">{pending ? "…" : "اختبر"}</button>
      </form>
      {result && !result.ok && <p className="text-xs text-danger-500">{result.message}</p>}
      {result?.ok && (
        <div className="space-y-2 text-sm">
          <p className="text-xs text-slate-500">{result.semantic ? "بحث دلالي + كلمات مفتاحية" : "بحث بالكلمات المفتاحية (اضبط مفتاح الذكاء الاصطناعي لبحث أذكى)"}</p>
          {result.direct ? (
            <div className="rounded-lg border border-success-500/30 bg-success-500/5 p-3">
              <p className="text-xs font-semibold text-success-500">⚡ رد مباشر بلا ذكاء اصطناعي (تطابق {Math.round(result.direct.similarity * 100)}%) — صفر توكنز</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-200">{result.direct.answer}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              {result.qas.length || result.chunks.length
                ? `🧠 سيُرسل للذكاء الاصطناعي ${result.qas.length + result.chunks.length} معلومة ذات صلة فقط (بدل كل المعرفة)`
                : "لا معرفة ذات صلة — سيجيب الذكاء الاصطناعي من الإعدادات العامة أو يحوّل لموظف"}
            </p>
          )}
          {result.qas.map((q, i) => (
            <div key={`q${i}`} className="rounded-lg bg-white/5 p-2 text-xs">
              <span className="text-slate-500">سؤال معتمد · {Math.round(q.score * 100)}%</span>
              <p className="text-slate-200">س: {q.question}</p>
              <p className="text-slate-400">ج: {q.answer}</p>
            </div>
          ))}
          {result.chunks.map((c, i) => (
            <div key={`c${i}`} className="rounded-lg bg-white/5 p-2 text-xs">
              <span className="text-slate-500">{c.sourceTitle} · {Math.round(c.score * 100)}%</span>
              <p className="whitespace-pre-wrap text-slate-300">{c.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
