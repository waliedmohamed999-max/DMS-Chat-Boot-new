import type { OrderStatus } from "@prisma/client";

/** مصدر واحد لتسميات/ترتيب/ألوان حالة الطلب — كانت مكررة نصاً ثابتاً في admin/tenants/[id]/orders/page.tsx
 * فقط سابقاً؛ الآن مشتركة معه ومع dashboard/orders (نفس مبدأ lib/contacts/stages.ts). */
export const ORDER_STATUSES_ORDERED: OrderStatus[] = ["ABANDONED_CART", "PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"];

export const ORDER_STATUS_LABELS_AR: Record<OrderStatus, string> = {
  ABANDONED_CART: "🛒 سلة متروكة",
  PENDING: "⏳ قيد الانتظار",
  PAID: "✅ مدفوع",
  SHIPPED: "🚚 تم الشحن",
  DELIVERED: "📦 تم التسليم",
  CANCELLED: "❌ ملغي",
};

export const ORDER_STATUS_BADGE_CLASSNAMES: Record<OrderStatus, string> = {
  ABANDONED_CART: "bg-warning-500/10 text-warning-500",
  PENDING: "bg-slate-500/10 text-slate-300",
  PAID: "bg-success-500/10 text-success-500",
  SHIPPED: "bg-accent-500/10 text-accent-400",
  DELIVERED: "bg-success-500/10 text-success-500",
  CANCELLED: "bg-danger-500/10 text-danger-500",
};
