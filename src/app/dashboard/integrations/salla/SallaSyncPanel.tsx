"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SallaSyncState } from "@/lib/integrations/salla/sync";
import { getSallaSyncStateAction, startSallaSyncAction } from "./actions";

const n = (x: number) => x.toLocaleString("ar-SA");

/** زر "مزامنة الآن" مع تقدّم حي (طلبات/منتجات/عملاء) — المزامنة تعمل بالخلفية ويُستعلم عن حالتها كل 3 ثوانٍ. */
export function SallaSyncPanel() {
  const router = useRouter();
  const [sync, setSync] = useState<SallaSyncState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: string | null = null;
    const poll = async () => {
      const s = await getSallaSyncStateAction().catch(() => null);
      if (stop) return;
      if (last === "running" && s?.status !== "running") router.refresh(); // تحديث الأرقام في الصفحة
      last = s?.status ?? null;
      setSync(s);
      if (s?.status === "running") timer = setTimeout(poll, 3000);
    };
    if (!sync || sync.status === "running") poll();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync?.status]);

  const running = sync?.status === "running";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 p-3 text-sm">
      <button
        type="button"
        disabled={pending || running}
        onClick={() =>
          start(async () => {
            const r = await startSallaSyncAction();
            setError(r.error ?? (r.started ? null : "هناك مزامنة جارية بالفعل"));
            setSync(r.sync);
          })
        }
        className="btn-secondary text-sm disabled:opacity-50"
      >
        {running ? "⏳ جارٍ المزامنة…" : "🔄 مزامنة الآن"}
      </button>
      {running && (
        <span className="text-accent-400">
          جارٍ سحب {sync.stage === "products" ? "المنتجات" : sync.stage === "customers" ? "العملاء" : "الطلبات"} — {n(sync.orders)} طلب · {n(sync.products)} منتج · {n(sync.customers)} عميل
        </span>
      )}
      {sync?.status === "done" && (
        <span className="text-slate-400">آخر مزامنة: {n(sync.orders)} طلب · {n(sync.products)} منتج · {n(sync.customers)} عميل</span>
      )}
      {sync?.status === "failed" && <span className="text-danger-500">فشلت: {sync.error}</span>}
      {error && <span className="text-warning-500">{error}</span>}
    </div>
  );
}
