import { IntegrationProvider } from "@prisma/client";
import { withTenant } from "@/lib/db";
import type { SyncResult } from "@/lib/integrations/types";
import { sallaGet } from "./api";
import { upsertSallaOrder, upsertSallaProduct } from "./mappers";

const PER_PAGE = 30;
const MAX_PAGES = 200; // حد أمان يمنع حلقة لا نهائية عند استجابة غير متوقَّعة من الـAPI

/** مزامنة كاملة حقيقية (طلبات + منتجات) من Admin API لسلة — عند الربط الأول ومن زر "مزامنة الآن". */
export async function fullSallaSync(tenantId: string): Promise<SyncResult> {
  let ordersSynced = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await sallaGet(tenantId, `/orders?page=${page}&per_page=${PER_PAGE}`);
    const orders: Array<Record<string, unknown>> = data?.data ?? [];
    if (orders.length === 0) break;
    await withTenant(tenantId, async (tx) => {
      for (const order of orders) if (await upsertSallaOrder(tx, tenantId, order)) ordersSynced++;
    });
    if (!hasNextPage(data?.pagination, page)) break;
  }

  let productsSynced = 0;
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
    if (!hasNextPage(data?.pagination, page)) break;
  }

  await withTenant(tenantId, (tx) =>
    tx.integration.update({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
      data: { lastSyncedAt: new Date(), lastError: null },
    })
  );
  return { ordersSynced, productsSynced };
}

/** مزامنة أولى بالخلفية بعد الربط — لا تُبطئ رد الـwebhook (سلة تنتظر 30 ثانية فقط). */
export function startInitialSallaSync(tenantId: string) {
  fullSallaSync(tenantId)
    .then((r) => console.log(`✅ مزامنة سلة الأولى للمستأجر ${tenantId}: ${r.ordersSynced} طلب، ${r.productsSynced} منتج`))
    .catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ فشلت مزامنة سلة الأولى للمستأجر ${tenantId}:`, message);
      await withTenant(tenantId, (tx) =>
        tx.integration.update({
          where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
          data: { lastError: `فشلت المزامنة الأولى: ${message}` },
        })
      ).catch(() => {});
    });
}

/** سلة تصف الترقيم بأكثر من شكل (links.next أو currentPage/totalPages) حسب الإصدار. */
function hasNextPage(p: Record<string, any> | undefined, page: number): boolean {
  if (!p) return false;
  if (p.links?.next || p.next) return true;
  const total = Number(p.totalPages ?? p.total_pages ?? 0);
  return total > 0 && Number(p.currentPage ?? p.current_page ?? page) < total;
}
