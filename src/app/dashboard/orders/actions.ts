"use server";

import { withTenant } from "@/lib/db";
import { requireTenantSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { computeWindowState } from "@/lib/inbox/windowState";
import { sendTemplateReply } from "@/app/dashboard/inbox/actions";

export type OrderSendRoute =
  | { route: "inbox"; conversationId: string }
  | { route: "template"; conversationId: string | null }
  | { route: "error"; message: string };

/**
 * يُستدعى عند الضغط على "إرسال سريع الآن" لطلب واحد — يقرر المسار الصحيح بدل بناء منطق إرسال جديد:
 * محادثة بنافذة 24 ساعة مفتوحة فعلاً → توجيه لصندوق المحادثات (رد نصي حر متاح هناك أصلاً، لا داعي
 * لتكرار sendReply هنا). محادثة بلا نافذة مفتوحة أو معدومة أصلاً → المسار الوحيد المسموح به من واتساب
 * هو قالب معتمد، فتُعرَض قائمة القوالب المعتمدة (quickSendOrderTemplate أدناه ينفّذ الإرسال الفعلي).
 */
export async function getOrderContactSendRoute(orderId: string): Promise<OrderSendRoute> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "orders.manage");
  const tenantId = session.user.tenantId;

  return withTenant(tenantId, async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId, tenantId }, select: { contactId: true } });
    if (!order) return { route: "error", message: "الطلب غير موجود" };

    const conversation = await tx.conversation.findFirst({ where: { tenantId, contactId: order.contactId } });
    if (conversation && computeWindowState(conversation.sessionWindowExpiresAt).isOpen) {
      return { route: "inbox", conversationId: conversation.id };
    }
    return { route: "template", conversationId: conversation?.id ?? null };
  });
}

export type QuickSendResult = { success: true; conversationId: string } | { success: false; error: string };

/** ينفّذ الإرسال الفعلي لقالب معتمد لعميل طلب واحد — ينشئ المحادثة إن لم توجد بعد (نفس نمط
 * queue/worker.ts::sendToContact)، ثم يُعيد استخدام sendTemplateReply الموجودة أصلاً لتنفيذ الإرسال
 * الحقيقي (فرض القالب المعتمد + الحد المعدلي + تحديث العدادات) بدل تكرار منطقها هنا. */
export async function quickSendOrderTemplate(orderId: string, templateId: string): Promise<QuickSendResult> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "orders.manage");
  const tenantId = session.user.tenantId;

  const order = await withTenant(tenantId, (tx) =>
    tx.order.findUnique({ where: { id: orderId, tenantId }, select: { contactId: true, status: true } })
  );
  if (!order) return { success: false, error: "الطلب غير موجود" };

  const conversationId = await withTenant(tenantId, async (tx) => {
    const existing = await tx.conversation.findFirst({ where: { tenantId, contactId: order.contactId } });
    if (existing) return existing.id;
    const created = await tx.conversation.create({
      data: { tenantId, contactId: order.contactId, status: "NEW", lastMessageAt: new Date() },
    });
    return created.id;
  });

  await sendTemplateReply(conversationId, templateId);

  // إن كان الطلب سلة متروكة، هذا الإرسال هو تحديداً "رسالة استرداد" — نفس الحقل الذي يمنع الحملة
  // الآلية (ABANDONED_CART trigger) من استهداف نفس الطلب مرتين، فيجب تحديثه هنا أيضاً وإلا ستُرسَل
  // رسالة استرداد تلقائية ثانية لاحقاً رغم إرسال هذه اليدوية للتو.
  if (order.status === "ABANDONED_CART") {
    await withTenant(tenantId, (tx) => tx.order.update({ where: { id: orderId, tenantId }, data: { recoveryMessageSentAt: new Date() } }));
  }

  await writeAuditLog({
    tenantId, userId: session.user.id,
    action: "order.quick_send_template", targetType: "Order", targetId: orderId, metaJson: { templateId, conversationId },
  });

  return { success: true, conversationId };
}
