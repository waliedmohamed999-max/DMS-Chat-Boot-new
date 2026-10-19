"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EmbeddedSummary } from "@/lib/integrations/salla/embedded";
import type { AutomationState, SallaAutomationKey } from "@/lib/integrations/salla/automations";
import type { SallaSyncState } from "@/lib/integrations/salla/sync";

type SdkLike = {
  init(o?: { debug?: boolean }): Promise<unknown>;
  ready(): void;
  destroy(): void;
  auth: { getToken(): string | null; refresh(): void };
  page: { setTitle(t: string): void };
  ui: { toast: { success(m: string): void; error(m: string): void } };
};

type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not_linked" }
  | { kind: "awaiting_confirmation"; email: string }
  | { kind: "linked"; summary: EmbeddedSummary };

const AUTOMATION_COPY: Record<SallaAutomationKey, { title: string; description: string; trigger: string }> = {
  abandonedCart: { title: "🛒 استرداد السلة المتروكة", description: "رسالة واتساب لكل عميل ترك سلته دون إتمام الطلب.", trigger: "ABANDONED_CART" },
  welcome: { title: "👋 ترحيب بالعميل الجديد", description: "رسالة ترحيب مرة واحدة لكل عميل جديد في متجرك.", trigger: "NEW_CUSTOMER" },
};

/**
 * صفحة DMS داخل لوحة تحكم سلة (Embedded Page). التسلسل حسب توثيق سلة: init ← getToken ← التحقق من الرمز
 * في خادمنا (Introspection) ← ready. خارج سلة (فتح الرابط مباشرة) تُقرأ قيمة ?token من الرابط مباشرة،
 * وإن لم توجد تظهر رسالة بدل شاشة تحميل لا تنتهي.
 */
export function SallaEmbeddedApp({ theme }: { theme: "light" | "dark" }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [sync, setSync] = useState<SallaSyncState | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const sdkRef = useRef<SdkLike | null>(null);
  const sessionRef = useRef<string | null>(null);
  const dark = theme === "dark";

  const toast = useCallback((ok: boolean, message: string) => {
    const sdk = sdkRef.current;
    if (sdk) (ok ? sdk.ui.toast.success : sdk.ui.toast.error).call(sdk.ui.toast, message);
    else alert(message);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let token: string | null = new URLSearchParams(window.location.search).get("token");
      const insideFrame = window.parent !== window;
      if (insideFrame) {
        try {
          const { embedded } = await import("@salla.sa/embedded-sdk");
          const sdk = embedded as unknown as SdkLike;
          await Promise.race([sdk.init(), new Promise((_, rej) => setTimeout(() => rej(new Error("init timeout")), 5000))]);
          sdkRef.current = sdk;
          token = sdk.auth.getToken() ?? token;
          sdk.page.setTitle("DMS Tech — واتساب للأعمال");
        } catch (err) {
          console.warn("Salla embedded SDK unavailable:", err);
        }
      }
      if (!token) {
        if (!cancelled) setView({ kind: "error", message: "افتح هذه الصفحة من داخل لوحة تحكم متجرك على سلة (التطبيقات ← DMS Tech)." });
        return;
      }

      const res = await fetch("/api/salla/embedded/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      }).catch(() => null);
      if (cancelled) return;
      if (!res || res.status === 401) {
        // رمز منتهي: نطلب من سلة إعادة تحميل الصفحة برمز جديد (يعيد التسلسل كاملاً).
        if (sdkRef.current) return sdkRef.current.auth.refresh();
        return setView({ kind: "error", message: "انتهت صلاحية الجلسة — أعد فتح التطبيق من لوحة سلة." });
      }
      const data = await res.json();
      if (data.state === "linked") {
        sessionRef.current = data.session;
        setView({ kind: "linked", summary: data.summary });
      } else if (data.state === "awaiting_confirmation") setView({ kind: "awaiting_confirmation", email: data.email });
      else setView({ kind: "not_linked" });
      sdkRef.current?.ready();
    })().catch((err) => {
      console.error(err);
      if (!cancelled) setView({ kind: "error", message: "تعذّر تحميل بيانات DMS — حاول مرة أخرى." });
      sdkRef.current?.ready();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function api(path: string, init?: RequestInit) {
    const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionRef.current}`, ...(init?.headers ?? {}) } });
    if (res.status === 401) {
      sdkRef.current?.auth.refresh();
      throw new Error("انتهت الجلسة — يُعاد التحميل");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "حدث خطأ");
    return body;
  }

  const linked = view.kind === "linked";
  // حالة المزامنة عند فتح التطبيق، ثم متابعة كل 3 ثوانٍ طالما هناك مزامنة جارية (التثبيت يبدأ واحدة تلقائياً).
  useEffect(() => {
    if (!linked) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const { sync: s } = await api("/api/salla/embedded/sync");
        if (stop) return;
        if (lastStatusRef.current === "running" && s?.status === "done") refreshSummary();
        lastStatusRef.current = s?.status ?? null;
        setSync(s);
        if (s?.status === "running") timer = setTimeout(poll, 3000);
      } catch {
        // انقطاع مؤقت — يحاول المستخدم من الزر
      }
    };
    if (!sync || sync.status === "running") poll();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, sync?.status]);

  async function refreshSummary() {
    try {
      const { summary } = await api("/api/salla/embedded/summary");
      setView({ kind: "linked", summary });
      toast(true, "اكتملت مزامنة بيانات متجرك");
    } catch {
      // تبقى الأرقام السابقة
    }
  }

  async function startSync() {
    setBusy("sync");
    try {
      const { started, sync: s } = await api("/api/salla/embedded/sync", { method: "POST" });
      lastStatusRef.current = s?.status ?? null;
      setSync(s);
      toast(true, started ? "بدأت المزامنة — قد تستغرق دقائق لمتجر كبير" : "هناك مزامنة جارية بالفعل");
    } catch (err) {
      toast(false, err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(null);
    }
  }

  async function toggle(a: AutomationState) {
    if (view.kind !== "linked" || !a.status) return;
    setBusy(a.key);
    try {
      const { automation } = await api("/api/salla/embedded/automation", { method: "POST", body: JSON.stringify({ key: a.key, enabled: a.status !== "ACTIVE" }) });
      setView({ ...view, summary: { ...view.summary, automations: view.summary.automations.map((x) => (x.key === a.key ? automation : x)) } });
      toast(true, automation.status === "ACTIVE" ? "تم التفعيل" : "تم الإيقاف");
    } catch (err) {
      toast(false, err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(null);
    }
  }

  async function sendPasswordLink() {
    setBusy("password");
    try {
      const { email } = await api("/api/salla/embedded/password-link", { method: "POST" });
      toast(true, `أُرسل رابط تحديد كلمة المرور إلى ${email}`);
    } catch (err) {
      toast(false, err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(null);
    }
  }

  const c = {
    page: dark ? "bg-[#0f1117] text-slate-100" : "bg-[#f6f7fb] text-slate-900",
    card: dark ? "bg-[#171a23] border-white/10" : "bg-white border-slate-200",
    muted: dark ? "text-slate-400" : "text-slate-500",
  };

  return (
    <div dir="rtl" className={`min-h-screen p-4 sm:p-6 ${c.page}`}>
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="DMS Tech" className="h-8 w-auto" />
            <div>
              <p className="font-bold">DMS Tech</p>
              <p className={`text-xs ${c.muted}`}>واتساب للأعمال لمتجرك على سلة</p>
            </div>
          </div>
          {view.kind === "linked" && (
            <a href={view.summary.dashboardUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#6d5ef8] px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
              فتح لوحة DMS الكاملة ↗
            </a>
          )}
        </header>

        {view.kind === "loading" && <div className={`rounded-xl border p-10 text-center text-sm ${c.card} ${c.muted}`}>جارٍ التحميل…</div>}

        {view.kind === "error" && <div className={`rounded-xl border p-8 text-center text-sm ${c.card}`}>{view.message}</div>}

        {view.kind === "not_linked" && (
          <div className={`rounded-xl border p-8 text-center ${c.card}`}>
            <p className="font-semibold">جارٍ تجهيز حسابك في DMS Tech</p>
            <p className={`mt-2 text-sm ${c.muted}`}>يُربط متجرك تلقائياً خلال لحظات من التثبيت. أعد فتح التطبيق بعد قليل، وإن استمرت هذه الرسالة تواصل مع دعم DMS Tech.</p>
          </div>
        )}

        {view.kind === "awaiting_confirmation" && (
          <div className={`rounded-xl border p-8 text-center ${c.card}`}>
            <div className="text-3xl">📧</div>
            <p className="mt-2 font-semibold">بانتظار تأكيد الربط</p>
            <p className={`mt-2 text-sm ${c.muted}`}>
              أرسلنا رابط تأكيد إلى <span dir="ltr">{view.email}</span>. افتح البريد واضغط "تأكيد الربط" لربط متجرك بحسابك في DMS.
            </p>
          </div>
        )}

        {view.kind === "linked" && (
          <>
            {view.summary.tenant.status === "PENDING_REVIEW" && (
              <Notice tone="warning" dark={dark}>حسابك قيد مراجعة سريعة من فريق DMS Tech — المزامنة تعمل الآن، وستُفعَّل الرسائل بعد الاعتماد.</Notice>
            )}
            {view.summary.store.status === "NEEDS_REAUTH" && (
              <Notice tone="danger" dark={dark}>انتهت صلاحية الربط — احذف التطبيق من متجرك ثم ثبّته من جديد.</Notice>
            )}
            {!view.summary.owner.passwordSet && (
              <Notice tone="info" dark={dark}>
                <span>حدّد كلمة مرور حسابك لتدخل لوحة DMS الكاملة (المحادثات، الحملات، الشات بوت).</span>
                <button onClick={sendPasswordLink} disabled={busy === "password"} className="mr-auto rounded-lg bg-[#6d5ef8] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {busy === "password" ? "جارٍ الإرسال…" : "أرسل الرابط لبريدي"}
                </button>
              </Notice>
            )}
            {!view.summary.whatsappConnected && (
              <Notice tone="info" dark={dark}>
                <span>اربط رقم واتساب متجرك لتبدأ إرسال الرسائل التلقائية والرد على العملاء.</span>
                <a href={`${view.summary.dashboardUrl}/integrations`} target="_blank" rel="noopener noreferrer" className="mr-auto rounded-lg border border-current px-3 py-1.5 text-xs font-semibold">ربط واتساب ↗</a>
              </Notice>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="طلبات" value={view.summary.counts.orders} card={c.card} muted={c.muted} />
              <Stat label="سلات متروكة" value={view.summary.counts.abandonedCarts} sub={view.summary.counts.pendingRecovery ? `${view.summary.counts.pendingRecovery} بلا رسالة` : undefined} card={c.card} muted={c.muted} />
              <Stat label="عملاء" value={view.summary.counts.contacts} card={c.card} muted={c.muted} />
              <Stat label="منتجات" value={view.summary.counts.products} card={c.card} muted={c.muted} />
              <Stat label="محادثات تنتظر رد" value={view.summary.counts.needsReply} card={c.card} muted={c.muted} />
            </div>

            <section className={`space-y-3 rounded-xl border p-5 ${c.card}`}>
              <div>
                <h2 className="font-semibold">الرسائل التلقائية على واتساب</h2>
                <p className={`text-xs ${c.muted}`}>تُرسل بقالب واتساب معتمد وتحترم موافقة العميل على الرسائل التسويقية.</p>
              </div>
              {view.summary.automations.map((a) => (
                <div key={a.key} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${dark ? "border-white/10" : "border-slate-200"}`}>
                  <div>
                    <p className="font-medium">{AUTOMATION_COPY[a.key].title}</p>
                    <p className={`text-xs ${c.muted}`}>{AUTOMATION_COPY[a.key].description}</p>
                  </div>
                  {a.status ? (
                    <button
                      role="switch"
                      aria-checked={a.status === "ACTIVE"}
                      disabled={busy === a.key}
                      onClick={() => toggle(a)}
                      className={`relative h-7 w-12 rounded-full transition disabled:opacity-50 ${a.status === "ACTIVE" ? "bg-[#22c55e]" : dark ? "bg-white/20" : "bg-slate-300"}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${a.status === "ACTIVE" ? "left-1" : "right-1"}`} />
                    </button>
                  ) : (
                    <a
                      href={`${view.summary.dashboardUrl}/campaigns/new?trigger=${AUTOMATION_COPY[a.key].trigger}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-[#6d5ef8] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      {a.requested ? "أكمل الإعداد (اختر القالب) ↗" : "إعداد ↗"}
                    </a>
                  )}
                </div>
              ))}
            </section>

            <section className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-5 ${c.card}`}>
              <div className="space-y-1">
                <h2 className="font-semibold">مزامنة بيانات متجرك</h2>
                {sync?.status === "running" ? (
                  <p className="text-sm text-[#6d5ef8]">
                    ⏳ جارٍ سحب {sync.stage === "products" ? "المنتجات" : sync.stage === "customers" ? "العملاء" : "الطلبات"}… ({sync.orders.toLocaleString("ar-SA")} طلب · {sync.products.toLocaleString("ar-SA")} منتج · {sync.customers.toLocaleString("ar-SA")} عميل)
                  </p>
                ) : sync?.status === "failed" ? (
                  <p className="text-sm text-red-500">تعذّرت المزامنة الأخيرة{sync.error ? `: ${sync.error}` : ""} — حاول مرة أخرى.</p>
                ) : (
                  <p className={`text-xs ${c.muted}`}>
                    تسحب الطلبات والمنتجات والعملاء من سلة إلى DMS. التحديثات الجديدة تصل تلقائياً بعدها.
                    {view.summary.store.lastSyncedAt && <> آخر مزامنة كاملة: {new Date(view.summary.store.lastSyncedAt).toLocaleString("ar-SA")}</>}
                    {sync?.status === "done" && <> — {sync.orders.toLocaleString("ar-SA")} طلب، {sync.products.toLocaleString("ar-SA")} منتج، {sync.customers.toLocaleString("ar-SA")} عميل</>}
                  </p>
                )}
              </div>
              <button
                onClick={startSync}
                disabled={busy === "sync" || sync?.status === "running"}
                className="rounded-lg bg-[#6d5ef8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sync?.status === "running" ? "جارٍ المزامنة…" : busy === "sync" ? "…" : "🔄 مزامنة بياناتي الآن"}
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, card, muted }: { label: string; value: number; sub?: string; card: string; muted: string }) {
  return (
    <div className={`rounded-xl border p-4 ${card}`}>
      <p className={`text-xs ${muted}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold">{value.toLocaleString("ar-SA")}</p>
      {sub && <p className="mt-1 text-[11px] text-amber-500">{sub}</p>}
    </div>
  );
}

function Notice({ tone, dark, children }: { tone: "info" | "warning" | "danger"; dark: boolean; children: React.ReactNode }) {
  const tones = {
    info: dark ? "border-[#6d5ef8]/40 bg-[#6d5ef8]/10 text-indigo-200" : "border-indigo-200 bg-indigo-50 text-indigo-800",
    warning: dark ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800",
    danger: dark ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-800",
  };
  return <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}
