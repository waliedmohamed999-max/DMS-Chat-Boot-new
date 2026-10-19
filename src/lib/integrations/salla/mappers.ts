import type { OrderStatus, Prisma } from "@prisma/client";

/**
 * تحويل بيانات سلة (من Admin API أو من أحداث الـwebhook — الشكلان متقاربان لكن غير متطابقين) إلى
 * جداول المنصة. نفس الدوال تُستخدم في المزامنة الكاملة وفي معالجة الأحداث اللحظية، وكلها upsert
 * فتكرار نفس الحدث (سلة تعيد الإرسال حتى 3 مرات) لا يُنشئ بيانات مكرَّرة.
 */

type Tx = Prisma.TransactionClient;
type Json = Record<string, any>;

/** رقم جوال سلة → صيغة E.164. سلة ترسل الرقم غالباً بلا مفتاح الدولة (`mobile`) مع `mobile_code` منفصل. */
export function sallaPhoneToE164(mobile: unknown, mobileCode?: unknown): string | null {
  if (mobile == null || mobile === "") return null;
  let digits = String(mobile).replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  const code = mobileCode ? String(mobileCode).replace(/[^\d]/g, "") : "";
  if (code) {
    if (digits.startsWith(code)) return `+${digits}`;
    return `+${code}${digits.replace(/^0+/, "")}`;
  }
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("05")) return `+966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `+966${digits}`;
  return `+${digits}`;
}

export function mapSallaOrderStatus(slug: string | null | undefined): OrderStatus {
  switch (slug) {
    case "payment_pending":
    case "under_review":
      return "PENDING";
    case "in_progress":
      return "PAID";
    case "shipped":
    case "delivering":
      return "SHIPPED";
    case "delivered":
    case "completed":
      return "DELIVERED";
    case "cancelled":
    case "canceled":
    case "refunded":
    case "restoring":
    case "restored":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

function amountOf(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "amount" in (value as Json)) return Number((value as Json).amount) || 0;
  return Number(value) || 0;
}

function fullName(c: Json | undefined): string | null {
  if (!c) return null;
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name || (typeof c.name === "string" && c.name.trim() ? c.name.trim() : null);
}

/** إنشاء/تحديث جهة اتصال من عميل سلة. يعيد null لو لا يوجد رقم جوال (لا يمكن التواصل عبر واتساب). */
export async function upsertSallaCustomer(tx: Tx, tenantId: string, customer: Json | undefined, opts?: { asCustomer?: boolean }) {
  if (!customer) return null;
  const phoneE164 = sallaPhoneToE164(customer.mobile ?? customer.phone, customer.mobile_code);
  if (!phoneE164) return null;

  const name = fullName(customer) ?? phoneE164;
  const email = typeof customer.email === "string" && customer.email.includes("@") ? customer.email.toLowerCase() : null;
  const city = typeof customer.city === "string" && customer.city.trim() ? customer.city.trim() : null;
  const externalSallaId = customer.id != null ? String(customer.id) : null;

  const existing = await tx.contact.findUnique({ where: { tenantId_phoneE164: { tenantId, phoneE164 } } });
  if (existing) {
    return tx.contact.update({
      where: { id: existing.id },
      data: {
        // لا نكتب فوق بيانات أدخلها التاجر يدوياً — نكمل الناقص فقط.
        ...(existing.name === existing.phoneE164 && name !== phoneE164 ? { name } : {}),
        ...(!existing.email && email ? { email } : {}),
        ...(!existing.city && city ? { city } : {}),
        ...(!existing.externalSallaId && externalSallaId ? { externalSallaId } : {}),
        ...(opts?.asCustomer && (existing.stage === "LEAD" || existing.stage === "CONTACTED") ? { stage: "CUSTOMER" } : {}),
      },
    });
  }
  return tx.contact.create({
    data: {
      tenantId, name, phoneE164, email, city, externalSallaId,
      stage: opts?.asCustomer ? "CUSTOMER" : "LEAD",
      source: "SALLA_SYNC",
    },
  });
}

/** طلب سلة (من API أو من أحداث order.*) → Order. يعيد null لو الطلب بلا عميل له رقم جوال. */
export async function upsertSallaOrder(tx: Tx, tenantId: string, order: Json) {
  if (order?.id == null) return null;
  const contact = await upsertSallaCustomer(tx, tenantId, order.customer, { asCustomer: true });
  if (!contact) return null;

  const statusSlug = typeof order.status === "string" ? order.status : order.status?.slug;
  const status = mapSallaOrderStatus(statusSlug);
  const totalSar = Math.round(amountOf(order.amounts?.total ?? order.total));
  const externalId = String(order.id);

  return tx.order.upsert({
    where: { tenantId_externalSource_externalId: { tenantId, externalSource: "SALLA", externalId } },
    update: { status, totalSar },
    create: { tenantId, contactId: contact.id, externalSource: "SALLA", externalId, status, totalSar },
  });
}

/**
 * سلة متروكة (حدث abandoned.cart) → Order بحالة ABANDONED_CART، فتلتقطها تلقائياً حملة "سلة متروكة"
 * الآلية الموجودة أصلاً (lib/campaigns/triggerEngine.ts) بلا أي منطق إضافي. المعرّف الخارجي مسبوق
 * بـ`cart-` لأن أرقام السلات وأرقام الطلبات في سلة سلسلتان منفصلتان قد تتقاطعان.
 */
export async function upsertSallaAbandonedCart(tx: Tx, tenantId: string, cart: Json) {
  if (cart?.id == null) return null;
  const contact = await upsertSallaCustomer(tx, tenantId, cart.customer);
  if (!contact) return null;

  const externalId = `cart-${cart.id}`;
  const totalSar = Math.round(amountOf(cart.total ?? cart.amounts?.total ?? cart.subtotal));
  return tx.order.upsert({
    where: { tenantId_externalSource_externalId: { tenantId, externalSource: "SALLA", externalId } },
    // لا نعيد حالة سلة تحوّلت لطلب أو أُرسلت لها رسالة استرداد — نحدّث المبلغ فقط.
    update: { totalSar },
    create: { tenantId, contactId: contact.id, externalSource: "SALLA", externalId, status: "ABANDONED_CART", totalSar },
  });
}

export async function upsertSallaProduct(tx: Tx, tenantId: string, product: Json) {
  if (product?.id == null) return null;
  const externalId = String(product.id);
  const priceSar = Math.round(amountOf(product.sale_price && amountOf(product.sale_price) > 0 ? product.sale_price : product.price));
  const stockQty = Number(product.quantity ?? product.stock_quantity ?? 0) || 0;
  const description = typeof product.description === "string" ? product.description : null;
  const categoryName = Array.isArray(product.categories) && product.categories[0]?.name ? String(product.categories[0].name) : null;
  const imageUrl =
    (typeof product.main_image === "string" && product.main_image) ||
    (Array.isArray(product.images) && product.images[0]?.url ? String(product.images[0].url) : null) ||
    (typeof product.thumbnail === "string" ? product.thumbnail : null);
  const name = String(product.name ?? "منتج بلا اسم");

  return tx.product.upsert({
    where: { tenantId_externalSource_externalId: { tenantId, externalSource: "SALLA", externalId } },
    update: { name, priceSar, stockQty, description, categoryName, imageUrl },
    create: { tenantId, externalSource: "SALLA", externalId, name, priceSar, stockQty, description, categoryName, imageUrl },
  });
}

export async function deleteSallaProduct(tx: Tx, tenantId: string, product: Json) {
  if (product?.id == null) return;
  await tx.product.deleteMany({ where: { tenantId, externalSource: "SALLA", externalId: String(product.id) } });
}
