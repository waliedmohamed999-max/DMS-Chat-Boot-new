import { withTenant } from "@/lib/db";

type AuditLogInput = {
  tenantId: string;
  userId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metaJson?: unknown;
};

/**
 * كل كتابة لسجل التدقيق يجب أن تمر من هنا وليس عبر rawDb.auditLog.create() مباشرة —
 * AuditLog جدول مستأجر (tenantId) وخاضع لـ RLS، فأي إدخال خارج withTenant() يُرفض
 * من قاعدة البيانات نفسها (وهذا هو المطلوب أمنياً، لكنه يعني أن الاستدعاء يجب أن يمر
 * عبر نفس آلية ضبط app.current_tenant_id).
 */
export async function writeAuditLog(input: AuditLogInput) {
  await withTenant(input.tenantId, async (tx) => {
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metaJson: input.metaJson as never,
      },
    });
  });
}
