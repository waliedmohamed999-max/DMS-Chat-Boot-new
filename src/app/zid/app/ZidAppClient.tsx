"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ZidAppSummary } from "@/lib/integrations/zid/appSession";
import type { ZidSyncState } from "@/lib/integrations/zid/sync";

const STORAGE_KEY = "dms-zid-app-session";
const n = (x: number) => x.toLocaleString("ar-SA");

const WELCOME: Record<string, string> = {
  created_account: "🎉 أنشأنا حسابك في DMS Tech وبدأنا سحب بيانات متجرك. أرسلنا لبريدك رابط تحديد كلمة المرور.",
  linked_existing: "✅ رُبط متجرك بحسابك الحالي في DMS Tech (نفس البريد) وبدأت المزامنة.",
  refreshed: "",
};

/**
 * صفحة تطبيق DMS لتاجر زد: حالة الربط والأرقام، مزامنة البيانات بتقدّم حي، تحديد كلمة المرور، وربط واتساب.
 * الجلسة تصل في #s= (لا تُرسل للخوادم ولا تظهر في السجلات) وتُنقل فوراً إلى sessionStorage وتُحذف من الرابط.
 */
export function ZidAppClient({ initialError, welcome }: { initialError: string | null; welcome: string | null }) {
  const [error, setError] = useState<string | null>(initialError);
  const [summary, setSummary] = useState<ZidAppSummary | null>(null);
  const [sync, setSync] = useState<ZidSyncState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const sessionRef = useRef<string | null>(null);
  const lastStatus = useRef<string | null>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionRef.current}`, ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("انتهت الجلسة — أعد فتح التطبيق من لوحة متجرك على زد");
    if (!res.ok) throw new Error(body.error ?? "حدث خطأ");
    return body;
  }, []);

  useEffect(() => {
    if (initialError) return;
    const m = /(?:^|[#&])s=([^&]+)/.exec(window.location.hash);
    try {
      if (m) {
        sessionStorage.setItem(STORAGE_KEY, m[1]!);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      sessionRef.current = m?.[1] ?? sessionStorage.getItem(STORAGE_KEY);
    } catch {
      sessionRef.current = m?.[1] ?? null;
    }
    if (!sessionRef.current) {
      setError("افتح هذه الصفحة من لوحة تحكم متجرك على زد (التطبيقات ← DMS Tech).");
      return;
    }
    api("/api/zid/app/summary")
      .then(({ summary: s }) => {
        setSummary(s);
        setSync(s.sync);
        lastStatus.current = s.sync?.status ?? null;
      })
      .catch((err) => setError(err instanceof Error ? err.message : "تعذّر التحميل"));
  }, [api, initialError]);

  // متابعة المزامنة الجارية كل 3 ثوانٍ، وتحديث الأرقام عند انتهائها.
  useEffect(() => {
    if (sync?.status !== "running") return;
    const t = setTimeout(async () => {
      try {
        const { sync: s } = await api("/api/zid/app/sync");
        if (lastStatus.current === "running" && s?.status === "done") {
          const { summary: fresh } = await api("/api/zid/app/summary");
          setSummary(fresh);
          setNotice({ ok: true, text: "اكتملت مزامنة بيانات متجرك" });
        }
        lastStatus.current = s?.status ?? null;
        setSync(s);
      } catch {
        // انقطاع مؤقت — تُعاد المحاولة من الزر
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [sync, api]);

  async function startSync() {
    setBusy("sync");
    setNotice(null);
    try {
      const { started, sync: s } = await api("/api/zid/app/sync", { method: "POST" });
      lastStatus.current = s?.status ?? null;
      setSync(s);
      setNotice({ ok: true, text: started ? "بدأت المزامنة — قد تستغرق دقائق لمتجر كبير" : "هناك مزامنة جارية بالفعل" });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "حدث خطأ" });
    } finally {
      setBusy(null);
    }
  }

  async function sendPasswordLink() {
    setBusy("password");
    try {
      const { email } = await api("/api/zid/app/password-link", { method: "POST" });
      setNotice({ ok: true, text: `أُرسل رابط تحديد كلمة المرور إلى ${email}` });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "حدث خطأ" });
    } finally {
      setBusy(null);
    }
  }

  const running = sync?.status === "running";
  const stage = sync?.stage === "products" ? "المنتجات" : sync?.stage === "customers" ? "العملاء" : sync?.stage === "carts" ? "السلات المتروكة" : "الطلبات";

  return (
    <div dir="rtl" className="min-h-screen bg-[#f6f7fb] p-4 text-slate-900 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="DMS Tech" className="h-8 w-auto" />
            <div>
              <p className="font-bold">DMS Tech</p>
              <p className="text-xs text-slate-500">واتساب للأعمال لمتجرك على زد</p>
            </div>
          </div>
          {summary && (
            <a href={summary.dashboardUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#6d5ef8] px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
              فتح لوحة DMS الكاملة ↗
            </a>
          )}
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-white p-8 text-center text-sm text-red-700">{error}</div>}
        {!error && !summary && <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">جارٍ التحميل…</div>}

        {summary && (
          <>
            {welcome && WELCOME[welcome] && <Box tone="ok">{WELCOME[welcome]}</Box>}
            {notice && <Box tone={notice.ok ? "ok" : "danger"}>{notice.text}</Box>}
            {summary.tenant.status === "PENDING_REVIEW" && <Box tone="warning">حسابك قيد مراجعة سريعة من فريق DMS Tech — المزامنة تعمل الآن، وستُفعَّل الرسائل بعد الاعتماد.</Box>}
            {summary.store.status === "NEEDS_REAUTH" && <Box tone="danger">انتهت صلاحية الربط — أعد فتح التطبيق من لوحة زد لتجديده.</Box>}
            {!summary.owner.passwordSet && (
              <Box tone="info">
                <span>حدّد كلمة مرور حسابك لتدخل لوحة DMS الكاملة (المحادثات، الحملات، الشات بوت).</span>
                <button onClick={sendPasswordLink} disabled={busy === "password"} className="mr-auto rounded-lg bg-[#6d5ef8] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {busy === "password" ? "جارٍ الإرسال…" : "أرسل الرابط لبريدي"}
                </button>
              </Box>
            )}
            {!summary.whatsappConnected && (
              <Box tone="info">
                <span>اربط رقم واتساب متجرك لتبدأ الرسائل التلقائية والرد على العملاء.</span>
                <a href={`${summary.dashboardUrl}/integrations`} target="_blank" rel="noopener noreferrer" className="mr-auto rounded-lg border border-current px-3 py-1.5 text-xs font-semibold">ربط واتساب ↗</a>
              </Box>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="طلبات" value={summary.counts.orders} />
              <Stat label="سلات متروكة" value={summary.counts.abandonedCarts} />
              <Stat label="عملاء" value={summary.counts.contacts} />
              <Stat label="منتجات" value={summary.counts.products} />
            </div>

            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
              <div className="space-y-1">
                <h2 className="font-semibold">مزامنة بيانات متجرك</h2>
                {running ? (
                  <p className="text-sm text-[#6d5ef8]">
                    ⏳ جارٍ سحب {stage}… ({n(sync!.orders)} طلب · {n(sync!.products)} منتج · {n(sync!.customers)} عميل · {n(sync!.carts ?? 0)} سلة)
                  </p>
                ) : sync?.status === "failed" ? (
                  <p className="text-sm text-red-600">تعذّرت المزامنة الأخيرة{sync.error ? `: ${sync.error}` : ""} — حاول مرة أخرى.</p>
                ) : (
                  <p className="text-xs text-slate-500">
                    تسحب الطلبات والمنتجات والعملاء والسلات المتروكة من زد إلى DMS، والتحديثات الجديدة تصل تلقائياً بعدها.
                    {summary.store.lastSyncedAt && <> آخر مزامنة كاملة: {new Date(summary.store.lastSyncedAt).toLocaleString("ar-SA")}</>}
                    {sync?.status === "done" && <> — {n(sync.orders)} طلب، {n(sync.products)} منتج، {n(sync.customers)} عميل، {n(sync.carts ?? 0)} سلة</>}
                  </p>
                )}
                {!summary.store.webhooks && <p className="text-xs text-amber-600">التحديثات اللحظية من زد غير مفعّلة بعد — أعد فتح التطبيق من لوحة زد.</p>}
              </div>
              <button onClick={startSync} disabled={busy === "sync" || running} className="rounded-lg bg-[#6d5ef8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {running ? "جارٍ المزامنة…" : busy === "sync" ? "…" : "🔄 مزامنة بياناتي الآن"}
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{n(value)}</p>
    </div>
  );
}

function Box({ tone, children }: { tone: "info" | "warning" | "danger" | "ok"; children: React.ReactNode }) {
  const tones = {
    info: "border-indigo-200 bg-indigo-50 text-indigo-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}
