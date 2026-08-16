import type { Prisma, InvoiceStatus } from "@prisma/client";

export type InvoiceSearchParams = {
  status?: string;
  tenantId?: string;
  planKey?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
};

const VALID_STATUSES: InvoiceStatus[] = ["PAID", "PENDING", "FAILED", "REFUNDED", "CANCELLED", "OVERDUE"];

/** فلاتر قائمة الفواتير (بند 6 في برومنت الإيرادات: حالة/تاجر/باقة/نطاق تاريخ) — دالة واحدة تُستخدَم
 * في صفحة العرض ومسار التصدير معاً، بنفس نمط buildTenantListWhere/buildAuditLogWhere. */
export function buildInvoiceWhere(params: InvoiceSearchParams): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {};

  if (params.status && (VALID_STATUSES as string[]).includes(params.status)) where.status = params.status as InvoiceStatus;
  if (params.tenantId) where.tenantId = params.tenantId;
  if (params.planKey) where.planKey = params.planKey;

  if (params.dateFrom || params.dateTo) {
    where.createdAt = {
      ...(params.dateFrom ? { gte: new Date(`${params.dateFrom}T00:00:00.000Z`) } : {}),
      ...(params.dateTo ? { lte: new Date(`${params.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  return where;
}
