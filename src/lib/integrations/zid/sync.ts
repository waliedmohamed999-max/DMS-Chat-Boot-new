import { IntegrationProvider } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { getStoreSyncState, startTrackedStoreSync, type StoreSyncCounts, type StoreSyncProgress, type StoreSyncState, type StoreSyncTrigger } from "@/lib/integrations/storeSync";
import { zidGet } from "./api";
import { upsertZidAbandonedCart, upsertZidCustomer, upsertZidOrder, upsertZidProduct } from "./mappers";

const PER_PAGE = 50;
const MAX_PAGES = 200; // حد أمان ضد حلقة لا نهائية عند رد غير متوقَّع

type Page = { items: Array<Record<string, any>>; hasMore: boolean };

/** صفحات زد تأتي بمفاتيح مختلفة حسب الواجهة (orders/results/customers/data) — ترقيم بـnext أو بعدد العناصر. */
function readPage(body: any, keys: string[]): Page {
  let items: Array<Record<string, any>> = [];
  for (const k of keys) {
    const v = k.split(".").reduce((o, p) => (o == null ? undefined : o[p]), body);
    if (Array.isArray(v)) {
      items = v;
      break;
    }
  }
  const next = body?.next ?? body?.pagination?.next ?? body?.links?.next;
  const hasMore = next === undefined ? items.length >= PER_PAGE : Boolean(next);
  return { items, hasMore };
}

/**
 * مزامنة كاملة من Zid Merchant API: الطلبات ← المنتجات ← العملاء ← السلات المتروكة. فشل قسم غير الطلبات
 * (صلاحية غير ممنوحة مثلاً) لا يُفشل البقية. `onProgress` يُستدعى بعد كل صفحة لعرض التقدم.
 */
export async function fullZidSync(tenantId: string, onProgress?: (p: StoreSyncProgress) => Promise<void> | void): Promise<StoreSyncCounts> {
  const c: StoreSyncCounts = { orders: 0, products: 0, customers: 0, carts: 0 };
  const report = (stage: StoreSyncProgress["stage"]) => onProgress?.({ stage, ...c });

  const section = async (
    stage: StoreSyncProgress["stage"],
    path: (page: number) => string,
    keys: string[],
    apply: (tx: Parameters<Parameters<typeof withTenant>[1]>[0], item: Record<string, any>) => Promise<unknown>,
    opts: { required?: boolean; storeHeaders?: boolean } = {}
  ) => {
    for (let page = 1; page <= MAX_PAGES; page++) {
      let body;
      try {
        body = await zidGet(tenantId, path(page), { storeHeaders: opts.storeHeaders });
      } catch (err) {
        if (opts.required) throw err;
        console.error(`⚠️ تعذّرت مزامنة ${stage} من زد:`, err instanceof Error ? err.message : err);
        return;
      }
      const { items, hasMore } = readPage(body, keys);
      if (items.length === 0) break;
      await withTenant(tenantId, async (tx) => {
        for (const item of items) if (await apply(tx, item)) c[stage]++;
      });
      await report(stage);
      if (!hasMore) break;
    }
  };

  await section("orders", (p) => `/managers/store/orders?page=${p}&per_page=${PER_PAGE}`, ["orders", "data", "results"], (tx, o) => upsertZidOrder(tx, tenantId, o), { required: true });
  await section("products", (p) => `/products/?page=${p}&page_size=${PER_PAGE}`, ["results", "products", "data"], (tx, o) => upsertZidProduct(tx, tenantId, o), { storeHeaders: true });
  await section("customers", (p) => `/managers/store/customers?page=${p}&per_page=${PER_PAGE}`, ["customers", "data", "results"], (tx, o) => upsertZidCustomer(tx, tenantId, o));
  await section("carts", (p) => `/managers/store/abandoned-carts?page=${p}&page_size=${PER_PAGE}`, ["carts", "abandoned_carts", "data", "results"], (tx, o) => upsertZidAbandonedCart(tx, tenantId, o));

  await withTenant(tenantId, (tx) =>
    tx.integration.update({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } }, data: { lastSyncedAt: new Date(), lastError: null } })
  );
  return c;
}

export type ZidSyncState = StoreSyncState;

export function getZidSyncState(tenantId: string): Promise<ZidSyncState | null> {
  return getStoreSyncState("zid", tenantId);
}

/** مزامنة متتبَّعة بالخلفية (قفل لكل تاجر + تقدّم حي) — false إن كانت هناك مزامنة جارية. */
export function startTrackedZidSync(tenantId: string, trigger: StoreSyncTrigger): Promise<boolean> {
  return startTrackedStoreSync(
    "zid", tenantId, trigger,
    async (onProgress) => {
      const integration = await withTenant(tenantId, (tx) =>
        tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } } })
      );
      if (integration?.isSandbox) {
        const { zidAdapter } = await import("./adapter"); // ربط تجريبي: بيانات sandbox
        const r = await zidAdapter.syncOrders(tenantId);
        return { orders: r.ordersSynced, products: r.productsSynced, customers: 0, carts: 0 };
      }
      return fullZidSync(tenantId, onProgress);
    },
    (message) =>
      withTenant(tenantId, (tx) =>
        tx.integration.update({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } }, data: { lastError: `فشلت المزامنة: ${message}` } })
      ).then(() => {})
  );
}
