import { IntegrationProvider } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { getStoreSyncState, startTrackedStoreSync, type StoreSyncProgress, type StoreSyncState, type StoreSyncTrigger } from "@/lib/integrations/storeSync";
import type { SyncResult } from "@/lib/integrations/types";
import { sallaGet } from "./api";
import { upsertSallaAbandonedCart, upsertSallaCustomer, upsertSallaOrder, upsertSallaProduct } from "./mappers";

const PER_PAGE = 30;
const MAX_PAGES = 200; // حد أمان يمنع حلقة لا نهائية عند استجابة غير متوقَّعة من الـAPI

export type SallaSyncProgress = StoreSyncProgress;
export type FullSallaSyncResult = SyncResult & { customersSynced: number; cartsSynced: number };

/**
 * مزامنة كاملة حقيقية (طلبات + منتجات + عملاء) من Admin API لسلة — عند التثبيت، ومن زر "مزامنة الآن"
 * في لوحة DMS أو داخل التطبيق في لوحة سلة. `onProgress` اختياري لعرض التقدم (يُستدعى بعد كل صفحة).
 */
export async function fullSallaSync(tenantId: string, onProgress?: (p: SallaSyncProgress) => Promise<void> | void): Promise<FullSallaSyncResult> {
  let ordersSynced = 0;
  let productsSynced = 0;
  let customersSynced = 0;
  let cartsSynced = 0;
  const report = (stage: SallaSyncProgress["stage"]) => onProgress?.({ stage, orders: ordersSynced, products: productsSynced, customers: customersSynced, carts: cartsSynced });
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

  // السلات المتروكة الحالية — تلتقطها حملة "سلة متروكة" الآلية كأي سلة تصل بحدث abandoned.cart.
  for (let page = 1; page <= MAX_PAGES; page++) {
    let data;
    try {
      data = await sallaGet(tenantId, `/carts/abandoned?page=${page}&per_page=${PER_PAGE}`);
    } catch (err) {
      console.error("⚠️ تعذّرت مزامنة سلات سلة المتروكة:", err instanceof Error ? err.message : err);
      break;
    }
    const carts: Array<Record<string, unknown>> = data?.data ?? [];
    if (carts.length === 0) break;
    await withTenant(tenantId, async (tx) => {
      for (const cart of carts) if (await upsertSallaAbandonedCart(tx, tenantId, cart)) cartsSynced++;
    });
    await report("carts");
    if (!hasNextPage(data?.pagination, page)) break;
  }

  await withTenant(tenantId, (tx) =>
    tx.integration.update({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
      data: { lastSyncedAt: new Date(), lastError: null },
    })
  );
  return { ordersSynced, productsSynced, customersSynced, cartsSynced };
}

export type SallaSyncState = StoreSyncState;
export type SallaSyncTrigger = StoreSyncTrigger;

/** حالة آخر مزامنة (جارية الآن أو آخر نتيجة) — للعرض في لوحة DMS وداخل تطبيق سلة. */
export function getSallaSyncState(tenantId: string): Promise<SallaSyncState | null> {
  return getStoreSyncState("salla", tenantId);
}

/** يبدأ مزامنة كاملة متتبَّعة بالخلفية — false إن كانت هناك مزامنة جارية لنفس التاجر (lib/integrations/storeSync.ts). */
export function startTrackedSallaSync(tenantId: string, trigger: SallaSyncTrigger): Promise<boolean> {
  return startTrackedStoreSync(
    "salla", tenantId, trigger,
    async (onProgress) => {
      const integration = await withTenant(tenantId, (tx) =>
        tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } })
      );
      if (integration?.isSandbox) {
        // ربط تجريبي: بيانات sandbox عبر الـadapter (استيراد متأخر لتفادي حلقة استيراد adapter ↔ sync).
        const { sallaAdapter } = await import("./adapter");
        const r = await sallaAdapter.syncOrders(tenantId);
        return { orders: r.ordersSynced, products: r.productsSynced, customers: 0, carts: 0 };
      }
      const r = await fullSallaSync(tenantId, onProgress);
      return { orders: r.ordersSynced, products: r.productsSynced, customers: r.customersSynced, carts: r.cartsSynced };
    },
    (message) =>
      withTenant(tenantId, (tx) =>
        tx.integration.update({
          where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
          data: { lastError: `فشلت المزامنة: ${message}` },
        })
      ).then(() => {})
  );
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
