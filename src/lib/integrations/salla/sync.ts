import { IntegrationProvider } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { redisConnection } from "@/lib/queue/connection";
import type { SyncResult } from "@/lib/integrations/types";
import { sallaGet } from "./api";
import { upsertSallaCustomer, upsertSallaOrder, upsertSallaProduct } from "./mappers";

const PER_PAGE = 30;
const MAX_PAGES = 200; // حد أمان يمنع حلقة لا نهائية عند استجابة غير متوقَّعة من الـAPI

export type SallaSyncProgress = { stage: "orders" | "products" | "customers"; orders: number; products: number; customers: number };
export type FullSallaSyncResult = SyncResult & { customersSynced: number };

/**
 * مزامنة كاملة حقيقية (طلبات + منتجات + عملاء) من Admin API لسلة — عند التثبيت، ومن زر "مزامنة الآن"
 * في لوحة DMS أو داخل التطبيق في لوحة سلة. `onProgress` اختياري لعرض التقدم (يُستدعى بعد كل صفحة).
 */
export async function fullSallaSync(tenantId: string, onProgress?: (p: SallaSyncProgress) => Promise<void> | void): Promise<FullSallaSyncResult> {
  let ordersSynced = 0;
  let productsSynced = 0;
  let customersSynced = 0;
  const report = (stage: SallaSyncProgress["stage"]) => onProgress?.({ stage, orders: ordersSynced, products: productsSynced, customers: customersSynced });
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await sallaGet(tenantId, `/orders?page=${page}&per_page=${PER_PAGE}`);
    const orders: Array<Record<string, unknown>> = data?.data ?? [];
    if (orders.length === 0) break;
    await withTenant(tenantId, async (tx) => {
      for (const order of orders) if (await upsertSallaOrder(tx, tenantId, order)) ordersSynced++;
    });
    await report("orders");
    if (!hasNextPage(data?.pagination, page)) break;
  }

  for (let page = 1; page <= MAX_PAGES; page++) {
    let data;
    try {
      data = await sallaGet(tenantId, `/products?page=${page}&per_page=${PER_PAGE}`);
    } catch (err) {
      // فشل مزامنة المنتجات (صلاحية غير ممنوحة مثلاً) لا يُفشل مزامنة الطلبات الأهم بيانياً.
      console.error("⚠️ تعذّرت مزامنة منتجات سلة:", err instanceof Error ? err.message : err);
      break;
    }
    const products: Array<Record<string, unknown>> = data?.data ?? [];
    if (products.length === 0) break;
    await withTenant(tenantId, async (tx) => {
      for (const product of products) if (await upsertSallaProduct(tx, tenantId, product)) productsSynced++;
    });
    await report("products");
    if (!hasNextPage(data?.pagination, page)) break;
  }

  // العملاء (بما فيهم من لم يطلب بعد) — العملاء أصحاب الطلبات أُضيفوا أصلاً مع طلباتهم أعلاه.
  for (let page = 1; page <= MAX_PAGES; page++) {
    let data;
    try {
      data = await sallaGet(tenantId, `/customers?page=${page}&per_page=${PER_PAGE}`);
    } catch (err) {
      console.error("⚠️ تعذّرت مزامنة عملاء سلة:", err instanceof Error ? err.message : err);
      break;
    }
    const customers: Array<Record<string, unknown>> = data?.data ?? [];
    if (customers.length === 0) break;
    await withTenant(tenantId, async (tx) => {
      for (const customer of customers) if (await upsertSallaCustomer(tx, tenantId, customer)) customersSynced++;
    });
    await report("customers");
    if (!hasNextPage(data?.pagination, page)) break;
  }

  await withTenant(tenantId, (tx) =>
    tx.integration.update({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
      data: { lastSyncedAt: new Date(), lastError: null },
    })
  );
  return { ordersSynced, productsSynced, customersSynced };
}

export type SallaSyncState = {
  status: "running" | "done" | "failed";
  trigger: SallaSyncTrigger;
  startedAt: string;
  finishedAt?: string;
  stage?: SallaSyncProgress["stage"];
  orders: number;
  products: number;
  customers: number;
  error?: string;
};
export type SallaSyncTrigger = "install" | "merchant_dashboard" | "salla_app" | "admin";

const STATE_TTL_SECONDS = 7 * 24 * 3600;
const LOCK_TTL_SECONDS = 30 * 60; // مزامنة عالقة (عملية أُعيد تشغيلها) لا تمنع غيرها أكثر من نصف ساعة
const stateKey = (tenantId: string) => `salla-sync:state:${tenantId}`;
const lockKey = (tenantId: string) => `salla-sync:lock:${tenantId}`;

async function writeState(tenantId: string, state: SallaSyncState) {
  await redisConnection.set(stateKey(tenantId), JSON.stringify(state), "EX", STATE_TTL_SECONDS).catch(() => {});
}

/** حالة آخر مزامنة (جارية الآن أو آخر نتيجة) — للعرض في لوحة DMS وداخل تطبيق سلة. */
export async function getSallaSyncState(tenantId: string): Promise<SallaSyncState | null> {
  const raw = await redisConnection.get(stateKey(tenantId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SallaSyncState;
  } catch {
    return null;
  }
}

/**
 * يبدأ مزامنة كاملة بالخلفية مع تتبّع حالتها وتقدّمها (لا تنتظر انتهاءها — سلة تنتظر 30 ثانية فقط للـwebhook،
 * ولوحة سلة لا يجب أن تتجمد). قفل لكل تاجر يمنع مزامنتين متزامنتين: يعيد false إن كانت هناك مزامنة جارية.
 */
export async function startTrackedSallaSync(tenantId: string, trigger: SallaSyncTrigger): Promise<boolean> {
  const locked = await redisConnection.set(lockKey(tenantId), trigger, "EX", LOCK_TTL_SECONDS, "NX").catch(() => "OK");
  if (locked !== "OK") return false;

  const state: SallaSyncState = { status: "running", trigger, startedAt: new Date().toISOString(), orders: 0, products: 0, customers: 0 };
  await writeState(tenantId, state);

  void (async () => {
    try {
      const integration = await withTenant(tenantId, (tx) =>
        tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } })
      );
      let result: FullSallaSyncResult;
      if (integration?.isSandbox) {
        // ربط تجريبي: بيانات sandbox عبر الـadapter (استيراد متأخر لتفادي حلقة استيراد adapter ↔ sync).
        const { sallaAdapter } = await import("./adapter");
        result = { ...(await sallaAdapter.syncOrders(tenantId)), customersSynced: 0 };
      } else {
        result = await fullSallaSync(tenantId, (p) =>
          writeState(tenantId, { ...state, stage: p.stage, orders: p.orders, products: p.products, customers: p.customers })
        );
      }
      await writeState(tenantId, {
        ...state, status: "done", finishedAt: new Date().toISOString(),
        orders: result.ordersSynced, products: result.productsSynced, customers: result.customersSynced,
      });
      console.log(`✅ مزامنة سلة (${trigger}) للمستأجر ${tenantId}: ${result.ordersSynced} طلب، ${result.productsSynced} منتج، ${result.customersSynced} عميل`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ فشلت مزامنة سلة (${trigger}) للمستأجر ${tenantId}:`, message);
      const current = (await getSallaSyncState(tenantId)) ?? state;
      await writeState(tenantId, { ...current, status: "failed", finishedAt: new Date().toISOString(), error: message.slice(0, 300) });
      await withTenant(tenantId, (tx) =>
        tx.integration.update({
          where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
          data: { lastError: `فشلت المزامنة: ${message}` },
        })
      ).catch(() => {});
    } finally {
      await redisConnection.del(lockKey(tenantId)).catch(() => {});
    }
  })();
  return true;
}

/** مزامنة أولى بالخلفية بعد الربط — لا تُبطئ رد الـwebhook (سلة تنتظر 30 ثانية فقط). */
export function startInitialSallaSync(tenantId: string) {
  startTrackedSallaSync(tenantId, "install").catch((err) => console.error("❌ تعذّر بدء مزامنة سلة الأولى:", err));
}

/** سلة تصف الترقيم بأكثر من شكل (links.next أو currentPage/totalPages) حسب الإصدار. */
function hasNextPage(p: Record<string, any> | undefined, page: number): boolean {
  if (!p) return false;
  if (p.links?.next || p.next) return true;
  const total = Number(p.totalPages ?? p.total_pages ?? 0);
  return total > 0 && Number(p.currentPage ?? p.current_page ?? page) < total;
}
