import { withTenant } from "@/lib/db";
import { completeZidAbandonedCart, deleteZidProduct, upsertZidAbandonedCart, upsertZidCustomer, upsertZidOrder, upsertZidProduct } from "./mappers";

/**
 * أحداث متجر زد (اشتراكاتنا عبر POST /managers/webhooks — اسم الحدث في رابط الاستقبال ?event=). جسم الحدث
 * هو الكائن نفسه (طلب/عميل/منتج/سلة)، أحياناً داخل data. كل المعالجة upsert فإعادة الإرسال آمنة.
 */
export type ZidEventResult = { note: string };

const ORDER_EVENTS = new Set(["order.create", "order.status.update", "order.payment_status.update"]);
const CUSTOMER_EVENTS = new Set(["customer.create", "customer.update", "customer.merchant.update"]);
const PRODUCT_UPSERT_EVENTS = new Set(["product.create", "product.update", "product.publish"]);

export async function processZidStoreEvent(tenantId: string, event: string, payload: Record<string, any>): Promise<ZidEventResult> {
  const data = payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? payload.data : payload;

  if (ORDER_EVENTS.has(event)) {
    const order = await withTenant(tenantId, (tx) => upsertZidOrder(tx, tenantId, data));
    return { note: order ? `تم تحديث الطلب #${data.code ?? data.id}` : "طلب بلا رقم جوال للعميل — تم تجاهله" };
  }
  if (event === "abandoned_cart.created") {
    const cart = await withTenant(tenantId, (tx) => upsertZidAbandonedCart(tx, tenantId, data));
    return { note: cart ? "سُجِّلت سلة متروكة" : "سلة متروكة بلا رقم جوال — تم تجاهلها" };
  }
  if (event === "abandoned_cart.completed") {
    const n = await withTenant(tenantId, (tx) => completeZidAbandonedCart(tx, tenantId, data));
    return { note: n ? "أكمل العميل الشراء — أُغلقت السلة" : "سلة غير مسجَّلة أو أُغلقت مسبقاً" };
  }
  if (CUSTOMER_EVENTS.has(event)) {
    const contact = await withTenant(tenantId, (tx) => upsertZidCustomer(tx, tenantId, data));
    return { note: contact ? "تم تحديث جهة الاتصال" : "عميل بلا رقم جوال — تم تجاهله" };
  }
  if (PRODUCT_UPSERT_EVENTS.has(event)) {
    await withTenant(tenantId, (tx) => upsertZidProduct(tx, tenantId, data));
    return { note: "تم تحديث المنتج" };
  }
  if (event === "product.delete") {
    await withTenant(tenantId, (tx) => deleteZidProduct(tx, tenantId, data));
    return { note: "تم حذف المنتج" };
  }
  return { note: "حدث غير مدعوم — تم تسجيله فقط" };
}
