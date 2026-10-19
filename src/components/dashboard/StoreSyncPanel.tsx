"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StoreSyncState } from "@/lib/integrations/storeSync";

const n = (x: number) => x.toLocaleString("ar-SA");
const STAGES: Record<string, string> = { orders: "الطلبات", products: "المنتجات", customers: "العملاء", carts: "السلات المتروكة" };

/**
 * زر "مزامنة الآن" مع تقدّم حي لمتجر (زد) — المزامنة تعمل بالخلفية ويُستعلم عن حالتها كل 3 ثوانٍ.
 * الإجراءات تُمرَّر من صفحة الخادم (Server Actions) فيبقى المكوّن مستقلاً عن المزوّد.
 */
export function StoreSyncPanel({
  getState,
  start,
}: {
  getState: () => Promise<StoreSyncState | null>;
  start: () => Promise<{ started: boolean; sync: StoreSyncState | null; error?: string }>;
}) {
  const router = useRouter();
  const [sync, setSync] = useState<StoreSyncState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: string | null = null;
    const poll = async () => {
      const s = await getState().catch(() => null);
      if (stop) return;
      if (last === "running" && s?.status !== "running") router.refresh();
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
  const counts = sync ? `${n(sync.orders)} طلب · ${n(sync.products)} منتج · ${n(sync.customers)} عميل · ${n(sync.carts ?? 0)} سلة` : "";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 p-3 text-sm">
      <button
        type="button"
        disabled={pending || running}
        onClick={() =>
          startTransition(async () => {
            const r = await start();
            setError(r.error ?? (r.started ? null : "هناك مزامنة جارية بالفعل"));
            setSync(r.sync);
          })
        }
        className="btn-secondary text-sm disabled:opacity-50"
      >
        {running ? "⏳ جارٍ المزامنة…" : "🔄 مزامنة الآن"}
      </button>
      {running && <span className="text-accent-400">جارٍ سحب {STAGES[sync.stage ?? "orders"]} — {counts}</span>}
      {sync?.status === "done" && <span className="text-slate-400">آخر مزامنة: {counts}</span>}
      {sync?.status === "failed" && <span className="text-danger-500">فشلت: {sync.error}</span>}
      {error && <span className="text-warning-500">{error}</span>}
    </div>
  );
}
