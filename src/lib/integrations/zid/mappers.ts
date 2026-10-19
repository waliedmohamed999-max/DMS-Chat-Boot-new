import type { OrderStatus, Prisma } from "@prisma/client";

/**
 * تحويل بيانات زد (من Merchant API أو من أحداث الـwebhook) إلى جداول المنصة. كلها upsert، فتكرار الحدث
 * أو المزامنة لا يُنشئ بيانات مكررة. بنية بيانات زد تختلف بين الإصدارات (أسماء متعددة اللغات {ar,en}،
 * أرقام كنصوص) فالاستخراج دفاعي بالكامل.
 */

type Tx = Prisma.TransactionClient;
type Json = Record<string, any>;

/** رقم جوال زد → E.164. زد ترسل غالباً 9665XXXXXXXX بلا +، وأحياناً 05XXXXXXXX محلياً. */
export function zidPhoneToE164(mobile: unknown): string | null {
  if (mobile == null || mobile === "") return null;
  const digits = String(mobile).replace(/[^\d+]/g, "");
  if (!digits || digits.replace(/\D/g, "").length < 8) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("05") && digits.length === 10) return `+966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `+966${digits}`;
  return `+${digits}`;
}

/** نص قد يأتي كقيمة أو كـ{ar, en}. */
export function zidText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const v = value as Json;
    return zidText(v.ar) ?? zidText(v.en) ?? zidText(v.name) ?? null;
  }
  return null;
}

function amount(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value.replace(/[^\d.]/g, "")) || 0;
  if (typeof value === "object") {
    const v = value as Json;
    return amount(v.amount ?? v.value ?? v.total);
  }
  return 0;
}

export function mapZidOrderStatus(code: string | null | undefined): OrderStatus {
  switch ((code ?? "").toLowerCase()) {
    case "new":
      return "PENDING";
    case "preparing":
    case "ready":
      return "PAID";
    case "indelivery":
    case "in_delivery":
    case "shipping":
      return "SHIPPED";
    case "delivered":
    case "completed":
      return "DELIVERED";
    case "cancelled":
    case "canceled":
    case "reversed":
    case "refunded":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

/** عميل زد → جهة اتصال. لا يكتب فوق بيانات أدخلها التاجر يدوياً — يكمل الناقص فقط. */
export async function upsertZidCustomer(tx: Tx, tenantId: string, customer: Json | undefined, opts?: { asCustomer?: boolean }) {
  if (!customer) return null;
  const phoneE164 = zidPhoneToE164(customer.mobile ?? customer.phone ?? customer.customer_mobile);
  if (!phoneE164) return null;
  const name = zidText(customer.name) ?? zidText(customer.customer_name) ?? ([customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || phoneE164);
  const emailRaw = zidText(customer.email ?? customer.customer_email);
  const email = emailRaw && emailRaw.includes("@") ? emailRaw.toLowerCase() : null;
  const city = zidText(customer.city?.name ?? customer.city);
  const externalZidId = customer.id != null ? String(customer.id) : null;

  const existing = await tx.contact.findUnique({ where: { tenantId_phoneE164: { tenantId, phoneE164 } } });
  if (existing) {
    return tx.contact.update({
      where: { id: existing.id },
      data: {
        ...(existing.name === existing.phoneE164 && name !== phoneE164 ? { name } : {}),
        ...(!existing.email && email ? { email } : {}),
        ...(!existing.city && city ? { city } : {}),
        ...(!existing.externalZidId && externalZidId ? { externalZidId } : {}),
        ...(opts?.asCustomer && (existing.stage === "LEAD" || existing.stage === "CONTACTED") ? { stage: "CUSTOMER" } : {}),
      },
    });
  }
  return tx.contact.create({
    data: { tenantId, name, phoneE164, email, city, externalZidId, stage: opts?.asCustomer ? "CUSTOMER" : "LEAD", source: "ZID_SYNC" },
  });
}

/** طلب زد → Order. null لو الطلب بلا عميل له رقم جوال (لا يمكن التواصل عبر واتساب). */
export async function upsertZidOrder(tx: Tx, tenantId: string, order: Json) {
  if (order?.id == null) return null;
  const contact = await upsertZidCustomer(tx, tenantId, order.customer, { asCustomer: true });
  if (!contact) return null;
  const statusCode = typeof order.order_status === "string" ? order.order_status : order.order_status?.code ?? order.status?.code ?? order.status;
  const status = mapZidOrderStatus(typeof statusCode === "string" ? statusCode : null);
  const totalSar = Math.round(amount(order.order_total ?? order.total ?? order.transaction_amount));
  const externalId = String(order.id);
  return tx.order.upsert({
    where: { tenantId_externalSource_externalId: { tenantId, externalSource: "ZID", externalId } },
    update: { status, totalSar },
    create: { tenantId, contactId: contact.id, externalSource: "ZID", externalId, status, totalSar },
  });
}

/**
 * سلة متروكة في زد → Order بحالة ABANDONED_CART (تلتقطها حملة "سلة متروكة" الآلية). بيانات العميل في السلة
 * قد تأتي كحقول مسطّحة (customer_name/customer_mobile) أو ككائن customer. المعرّف مسبوق بـ`cart-`.
 */
export async function upsertZidAbandonedCart(tx: Tx, tenantId: string, cart: Json) {
  const id = cart?.id ?? cart?.cart_id;
  if (id == null) return null;
  const customer = cart.customer ?? {
    id: cart.customer_id, name: cart.customer_name, mobile: cart.customer_mobile ?? cart.phone, email: cart.customer_email,
  };
  const contact = await upsertZidCustomer(tx, tenantId, customer);
  if (!contact) return null;
  const externalId = `cart-${id}`;
  const totalSar = Math.round(amount(cart.cart_total ?? cart.total ?? cart.sub_total ?? cart.cart_total_string));
  return tx.order.upsert({
    where: { tenantId_externalSource_externalId: { tenantId, externalSource: "ZID", externalId } },
    update: { totalSar },
    create: { tenantId, contactId: contact.id, externalSource: "ZID", externalId, status: "ABANDONED_CART", totalSar },
  });
}

/** abandoned_cart.completed: العميل أكمل الشراء ⇒ تُغلق السلة (PAID) فلا تصله رسالة استرداد بعد ذلك. */
export async function completeZidAbandonedCart(tx: Tx, tenantId: string, cart: Json) {
  const id = cart?.id ?? cart?.cart_id;
  if (id == null) return 0;
  const r = await tx.order.updateMany({
    where: { tenantId, externalSource: "ZID", externalId: `cart-${id}`, status: "ABANDONED_CART" },
    data: { status: "PAID" },
  });
  return r.count;
}

export async function upsertZidProduct(tx: Tx, tenantId: string, product: Json) {
  if (product?.id == null) return null;
  const externalId = String(product.id);
  const name = zidText(product.name) ?? "منتج بلا اسم";
  const sale = amount(product.sale_price);
  const priceSar = Math.round(sale > 0 ? sale : amount(product.price));
  const stockQty = Number(product.quantity ?? product.stock ?? 0) || 0;
  const description = zidText(product.description);
  const cats = product.categories ?? product.category;
  const categoryName = Array.isArray(cats) ? zidText(cats[0]?.name) : cats && typeof cats === "object" ? zidText((cats as Json).name) : null;
  const images = product.images ?? product.image;
  const imageUrl = Array.isArray(images)
    ? typeof images[0] === "string"
      ? images[0]
      : zidText(images[0]?.image?.full_size ?? images[0]?.image?.medium ?? images[0]?.url ?? images[0]?.original_url)
    : typeof images === "string"
      ? images
      : null;
  return tx.product.upsert({
    where: { tenantId_externalSource_externalId: { tenantId, externalSource: "ZID", externalId } },
    update: { name, priceSar, stockQty, description, categoryName, imageUrl },
    create: { tenantId, externalSource: "ZID", externalId, name, priceSar, stockQty, description, categoryName, imageUrl },
  });
}

export async function deleteZidProduct(tx: Tx, tenantId: string, product: Json) {
  if (product?.id == null) return;
  await tx.product.deleteMany({ where: { tenantId, externalSource: "ZID", externalId: String(product.id) } });
}
