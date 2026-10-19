import { redisConnection } from "@/lib/queue/connection";

/**
 * مزامنة متاجر (سلة/زد) بالخلفية مع تتبّع الحالة والتقدّم في Redis: قفل لكل تاجر يمنع مزامنتين متزامنتين،
 * وحالة آخر مزامنة (جارية/انتهت/فشلت + الأعداد) تقرؤها لوحة DMS وصفحة التطبيق داخل المنصة ولوحة الأدمن.
 */

export type StoreSyncProvider = "salla" | "zid";
export type StoreSyncTrigger = "install" | "merchant_dashboard" | "salla_app" | "zid_app" | "admin";
export type StoreSyncStage = "orders" | "products" | "customers" | "carts";
export type StoreSyncProgress = { stage: StoreSyncStage; orders: number; products: number; customers: number; carts: number };
export type StoreSyncCounts = { orders: number; products: number; customers: number; carts: number };

export type StoreSyncState = {
  status: "running" | "done" | "failed";
  trigger: StoreSyncTrigger;
  startedAt: string;
  finishedAt?: string;
  stage?: StoreSyncStage;
  orders: number;
  products: number;
  customers: number;
  carts?: number;
  error?: string;
};

const STATE_TTL_SECONDS = 7 * 24 * 3600;
const LOCK_TTL_SECONDS = 30 * 60; // مزامنة عالقة (عملية أُعيد تشغيلها) لا تمنع غيرها أكثر من نصف ساعة
const stateKey = (p: StoreSyncProvider, tenantId: string) => `${p}-sync:state:${tenantId}`;
const lockKey = (p: StoreSyncProvider, tenantId: string) => `${p}-sync:lock:${tenantId}`;

async function writeState(p: StoreSyncProvider, tenantId: string, state: StoreSyncState) {
  await redisConnection.set(stateKey(p, tenantId), JSON.stringify(state), "EX", STATE_TTL_SECONDS).catch(() => {});
}

export async function getStoreSyncState(p: StoreSyncProvider, tenantId: string): Promise<StoreSyncState | null> {
  const raw = await redisConnection.get(stateKey(p, tenantId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoreSyncState;
  } catch {
    return null;
  }
}

/**
 * يبدأ المزامنة بالخلفية ولا ينتظرها (المنصّتان تنتظران ردوداً سريعة، والصفحات لا يجب أن تتجمد).
 * يعيد false إن كانت هناك مزامنة جارية لنفس التاجر. `onFailure` يسجّل الخطأ على الربط نفسه.
 */
export async function startTrackedStoreSync(
  p: StoreSyncProvider,
  tenantId: string,
  trigger: StoreSyncTrigger,
  run: (onProgress: (progress: StoreSyncProgress) => Promise<void>) => Promise<StoreSyncCounts>,
  onFailure: (message: string) => Promise<void>
): Promise<boolean> {
  const locked = await redisConnection.set(lockKey(p, tenantId), trigger, "EX", LOCK_TTL_SECONDS, "NX").catch(() => "OK");
  if (locked !== "OK") return false;

  const state: StoreSyncState = { status: "running", trigger, startedAt: new Date().toISOString(), orders: 0, products: 0, customers: 0, carts: 0 };
  await writeState(p, tenantId, state);

  void (async () => {
    try {
      const counts = await run((progress) => writeState(p, tenantId, { ...state, ...progress }));
      await writeState(p, tenantId, { ...state, ...counts, status: "done", finishedAt: new Date().toISOString() });
      console.log(`✅ مزامنة ${p} (${trigger}) للمستأجر ${tenantId}: ${counts.orders} طلب، ${counts.products} منتج، ${counts.customers} عميل، ${counts.carts} سلة متروكة`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ فشلت مزامنة ${p} (${trigger}) للمستأجر ${tenantId}:`, message);
      const current = (await getStoreSyncState(p, tenantId)) ?? state;
      await writeState(p, tenantId, { ...current, status: "failed", finishedAt: new Date().toISOString(), error: message.slice(0, 300) });
      await onFailure(message).catch(() => {});
    } finally {
      await redisConnection.del(lockKey(p, tenantId)).catch(() => {});
    }
  })();
  return true;
}
