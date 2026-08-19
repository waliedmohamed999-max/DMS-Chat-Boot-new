import type { Prisma, OrderStatus } from "@prisma/client";

/**
 * فلاتر قائمة الطلبات — نفس مبدأ lib/contacts/filters.ts (مصدر شرط Prisma واحد يُستخدم من صفحة
 * القائمة، بلا ازدواج منطق لو احتاج لاحقاً مسار تصدير مماثل لـ/api/contacts/export).
 */
export type OrderListSearchParams = {
  q?: string;
  tab?: OrderStatus | "all";
  source?: "ZID" | "SALLA" | "";
  dateFrom?: string;
  dateTo?: string;
};

export function buildOrderListWhere(tenantId: string, params: OrderListSearchParams): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { tenantId };

  if (params.tab && params.tab !== "all") where.status = params.tab;
  if (params.source) where.externalSource = params.source;

  const q = params.q?.trim();
  if (q) {
    where.contact = { OR: [{ name: { contains: q, mode: "insensitive" } }, { phoneE164: { contains: q } }] };
  }

  if (params.dateFrom || params.dateTo) {
    where.createdAt = {
      ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
      ...(params.dateTo ? { lte: new Date(`${params.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  return where;
}
