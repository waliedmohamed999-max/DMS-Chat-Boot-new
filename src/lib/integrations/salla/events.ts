import { IntegrationProvider } from "@prisma/client";
import { superAdminDb, withTenant } from "@/lib/db";
import { handleSallaAuthorize, handleSallaUninstall } from "./install";
import { setAutomationEnabled, type SallaAutomationKey } from "./automations";
import { deleteSallaProduct, upsertSallaAbandonedCart, upsertSallaCustomer, upsertSallaOrder, upsertSallaProduct } from "./mappers";

export type SallaEventPayload = { event?: string; merchant?: string | number; created_at?: string; data?: Record<string, any> };

export type SallaEventResult = {
  tenantId: string | null;
  /** ملاحظة تُحفظ في سجل الأحداث (تظهر للتاجر في صفحة سلة) — نتيجة المعالجة أو سبب تجاهل الحدث. */
  note: string;
  /** true = حدث معروف لم يُطابَق بتاجر (يُسجَّل للمراجعة بدل اعتباره خطأ يستدعي إعادة الإرسال). */
  unmatched?: boolean;
};

const ORDER_EVENTS = new Set(["order.created", "order.updated", "order.status.updated", "order.cancelled", "order.refunded", "order.payment.updated"]);
const CUSTOMER_EVENTS = new Set(["customer.created", "customer.updated"]);
const PRODUCT_UPSERT_EVENTS = new Set(["product.created", "product.updated", "product.price.updated", "product.status.updated", "product.quantity.low", "product.available"]);
const INFO_EVENTS = new Set(["app.installed", "app.updated", "app.feedback.created"]);

/** معالجة حدث سلة واحد بعد التحقق من توقيعه. أي استثناء يُرمى = فشل يجعل سلة تعيد الإرسال. */
export async function processSallaEvent(payload: SallaEventPayload): Promise<SallaEventResult> {
  const event = payload.event ?? "unknown";
  const merchantId = payload.merchant != null ? String(payload.merchant) : null;
  const data = payload.data ?? {};
  if (!merchantId) return { tenantId: null, note: "حدث بلا رقم تاجر", unmatched: true };

  if (event === "app.store.authorize") {
    const result = await handleSallaAuthorize(merchantId, data);
    if (result.outcome === "conflict") return { tenantId: null, note: result.reason, unmatched: true };
    if (result.outcome === "awaiting_confirmation") return { tenantId: null, note: `بانتظار تأكيد صاحب البريد ${result.email} للربط` };
    const notes = { refreshed: "تم تحديث رموز الوصول", linked_existing: "رُبط المتجر بحساب قائم بنفس البريد", created_account: "أُنشئ حساب جديد للتاجر" } as const;
    return { tenantId: result.tenantId, note: notes[result.outcome] };
  }

  if (event === "app.uninstalled") {
    const tenantId = await handleSallaUninstall(merchantId);
    return tenantId ? { tenantId, note: "حُذف التطبيق من المتجر — تم فك الربط" } : { tenantId: null, note: "متجر غير مربوط", unmatched: true };
  }

  const integration = await superAdminDb.integration.findFirst({
    where: { provider: IntegrationProvider.SALLA, externalAccountId: merchantId, isSandbox: false },
  });
  if (!integration) return { tenantId: null, note: "لم يتم إيجاد متجر سلة مطابق", unmatched: true };
  const tenantId = integration.tenantId;
  if (integration.status === "DISCONNECTED") return { tenantId, note: "الربط مفصول — تم تجاهل الحدث" };

  if (INFO_EVENTS.has(event)) return { tenantId, note: "تم الاستلام" };

  if (event === "app.settings.updated") {
    const applied = await applySallaSettings(tenantId, (data.settings ?? {}) as Record<string, unknown>);
    return { tenantId, note: applied.length ? `طُبِّقت إعدادات التطبيق: ${applied.join("، ")}` : "لا إعدادات معروفة للتطبيق" };
  }

  if (ORDER_EVENTS.has(event)) {
    const order = await withTenant(tenantId, (tx) => upsertSallaOrder(tx, tenantId, data));
    return { tenantId, note: order ? `تم تحديث الطلب #${data.reference_id ?? data.id}` : "طلب بلا رقم جوال للعميل — تم تجاهله" };
  }

  if (event === "abandoned.cart") {
    const cart = await withTenant(tenantId, (tx) => upsertSallaAbandonedCart(tx, tenantId, data));
    return { tenantId, note: cart ? "سُجِّلت سلة متروكة" : "سلة متروكة بلا رقم جوال — تم تجاهلها" };
  }

  if (CUSTOMER_EVENTS.has(event)) {
    const contact = await withTenant(tenantId, (tx) => upsertSallaCustomer(tx, tenantId, data));
    return { tenantId, note: contact ? "تم تحديث جهة الاتصال" : "عميل بلا رقم جوال — تم تجاهله" };
  }

  if (PRODUCT_UPSERT_EVENTS.has(event)) {
    await withTenant(tenantId, (tx) => upsertSallaProduct(tx, tenantId, data));
    return { tenantId, note: "تم تحديث المنتج" };
  }

  if (event === "product.deleted") {
    await withTenant(tenantId, (tx) => deleteSallaProduct(tx, tenantId, data));
    return { tenantId, note: "تم حذف المنتج" };
  }

  return { tenantId, note: "حدث غير مدعوم — تم تسجيله فقط" };
}

/**
 * حدث app.settings.updated: مفاتيح نموذج إعدادات التطبيق في بوابة شركاء سلة (موثَّقة في
 * docs/SALLA_APP_SETUP.md) — abandoned_cart_enabled / welcome_enabled تشغّل/توقف الرسائل التلقائية.
 */
const SETTINGS_KEYS: Record<string, SallaAutomationKey> = { abandoned_cart_enabled: "abandonedCart", welcome_enabled: "welcome" };
const SETTING_LABELS: Record<SallaAutomationKey, string> = { abandonedCart: "استرداد السلة", welcome: "الترحيب" };

async function applySallaSettings(tenantId: string, settings: Record<string, unknown>): Promise<string[]> {
  const applied: string[] = [];
  for (const [settingKey, key] of Object.entries(SETTINGS_KEYS)) {
    if (!(settingKey in settings)) continue;
    const v = settings[settingKey];
    const enabled = v === true || v === 1 || ["1", "true", "on", "yes"].includes(String(v).toLowerCase());
    await setAutomationEnabled(tenantId, key, enabled);
    applied.push(`${SETTING_LABELS[key]} ${enabled ? "مفعّل" : "متوقف"}`);
  }
  return applied;
}
