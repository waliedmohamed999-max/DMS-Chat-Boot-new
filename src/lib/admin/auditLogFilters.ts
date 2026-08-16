import type { Prisma } from "@prisma/client";

export type AuditLogSearchParams = {
  userId?: string;
  tenantId?: string;
  action?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
};

/**
 * فلاتر سجل التدقيق الشامل (بند ي في برومنت التدقيق) — بمستخدم داخلي، تاجر متأثر، نوع الحدث، ونطاق
 * تاريخ. مبنية كدالة منفصلة (مطابقة لنمط buildTenantListWhere) لضمان استخدام نفس منطق الفلترة حرفياً
 * في كل من صفحة العرض ومسار التصدير — بلا ازدواج قد ينحرف بينهما لاحقاً.
 */
export function buildAuditLogWhere(params: AuditLogSearchParams): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (params.userId) where.userId = params.userId;
  if (params.tenantId) where.tenantId = params.tenantId;
  if (params.action) where.action = params.action;

  if (params.dateFrom || params.dateTo) {
    where.createdAt = {
      ...(params.dateFrom ? { gte: new Date(`${params.dateFrom}T00:00:00.000Z`) } : {}),
      ...(params.dateTo ? { lte: new Date(`${params.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  return where;
}
