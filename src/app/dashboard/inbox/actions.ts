"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { requireEffectivePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { resolveWhatsappAdapter } from "@/lib/integrations/registry";
import { isSandboxMode } from "@/lib/integrations/types";
import { computeWindowState } from "@/lib/inbox/windowState";
import { statusAfterOutboundReply } from "@/lib/inbox/conversationStatus";
import { scheduleOutboundStatusProgression } from "@/lib/queue/messageStatusQueue";
import { simulateInboundMessage, type SimulatedMessageKind } from "@/lib/inbox/sandboxSimulator";

async function sendOutboundMessage(
  tenantId: string,
  userId: string,
  conversationId: string,
  body: string,
  templateId?: string,
  quotedMessageId?: string
) {
  const adapter = await resolveWhatsappAdapter(tenantId);

  return withTenant(tenantId, async (tx) => {
    const convo = await tx.conversation.findUniqueOrThrow({
      where: { id: conversationId, tenantId },
      include: { contact: true },
    });

    const result = await adapter.sendMessage(tenantId, convo.contact.phoneE164, body);

    const message = await tx.message.create({
      data: {
        tenantId, conversationId, direction: "OUTBOUND", senderType: "AGENT",
        type: templateId ? "TEMPLATE" : "TEXT", body, templateId, quotedMessageId,
        waMessageId: result.externalMessageId,
        status: result.success ? "SENT" : "FAILED",
        statusUpdatedAt: new Date(),
        failureReason: result.success ? null : result.error,
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        status: statusAfterOutboundReply(convo.status),
        assignedAgentId: convo.assignedAgentId ?? userId,
      },
    });

    return { message, success: result.success, waMessageId: result.externalMessageId };
  });
}

export async function sendReply(conversationId: string, formData: FormData) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "inbox.reply");
  const tenantId = session.user.tenantId;

  // بلا هذا الحد، جلسة موظف مخترَقة/مسيئة كانت تقدر تُغرق الإرسال الفعلي عبر واتساب بلا أي عائق —
  // نفس الحد المستخدم فعلياً لإرسال الحملات (worker.ts) لكن بمفتاح منفصل حتى لا تتشارك الحصة.
  const rateLimit = await checkTenantRateLimit(tenantId, "inbox-send", 60, 10);
  if (!rateLimit.allowed) {
    throw new Error("تجاوزت حد الإرسال المسموح — أعد المحاولة بعد لحظات.");
  }

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const quotedMessageId = formData.get("quotedMessageId");

  // فرض نافذة الـ24 ساعة من الخادم (وليس فقط تعطيل الحقل في الواجهة): أي محاولة إرسال نص حر بعد
  // انتهاء النافذة تُرفض — الرد المسموح الوحيد حينها هو قالب معتمد عبر sendTemplateReply.
  const convo = await withTenant(tenantId, (tx) =>
    tx.conversation.findUniqueOrThrow({ where: { id: conversationId, tenantId } })
  );
  const window = computeWindowState(convo.sessionWindowExpiresAt);
  if (!window.isOpen) {
    throw new Error("انتهت نافذة الـ24 ساعة — لا يمكن إرسال رد نصي حر، استخدم قالباً معتمداً.");
  }

  const { message, success } = await sendOutboundMessage(
    tenantId, session.user.id, conversationId, body, undefined,
    quotedMessageId ? String(quotedMessageId) : undefined
  );

  if (success && (await isSandboxMode()) && message.waMessageId) {
    await scheduleOutboundStatusProgression(tenantId, message.waMessageId);
  }

  revalidatePath(`/dashboard/inbox/${conversationId}`);
  revalidatePath("/dashboard/inbox");
}

export async function sendTemplateReply(conversationId: string, templateId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "inbox.reply");
  const tenantId = session.user.tenantId;

  const rateLimit = await checkTenantRateLimit(tenantId, "inbox-send", 60, 10);
  if (!rateLimit.allowed) {
    throw new Error("تجاوزت حد الإرسال المسموح — أعد المحاولة بعد لحظات.");
  }

  const template = await withTenant(tenantId, (tx) => tx.messageTemplate.findUnique({ where: { id: templateId, tenantId } }));
  if (!template || template.status !== "APPROVED") {
    throw new Error("لا يمكن استخدام قالب غير معتمد من Meta.");
  }

  const { message, success } = await sendOutboundMessage(tenantId, session.user.id, conversationId, template.bodyText, templateId);

  if (success && (await isSandboxMode()) && message.waMessageId) {
    await scheduleOutboundStatusProgression(tenantId, message.waMessageId);
  }

  revalidatePath(`/dashboard/inbox/${conversationId}`);
  revalidatePath("/dashboard/inbox");
}

export async function markResolved(conversationId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "inbox.reply");

  await withTenant(session.user.tenantId, async (tx) => {
    await tx.conversation.update({
      where: { id: conversationId, tenantId: session.user.tenantId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  });

  revalidatePath("/dashboard/inbox");
  revalidatePath(`/dashboard/inbox/${conversationId}`);
}

export async function assignConversation(conversationId: string, agentUserId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "inbox.assign");
  const tenantId = session.user.tenantId;

  const agent = await withTenant(tenantId, (tx) => tx.user.findUniqueOrThrow({ where: { id: agentUserId, tenantId } }));

  await withTenant(tenantId, (tx) =>
    tx.conversation.update({ where: { id: conversationId, tenantId }, data: { assignedAgentId: agentUserId } })
  );

  await writeAuditLog({
    tenantId, userId: session.user.id, action: "inbox.assign", targetType: "Conversation",
    targetId: conversationId, metaJson: { assignedTo: agent.name },
  });

  revalidatePath(`/dashboard/inbox/${conversationId}`);
  revalidatePath("/dashboard/inbox");
}

export async function transferConversation(conversationId: string, toUserId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "inbox.assign");
  const tenantId = session.user.tenantId;

  const [fromConvo, toUser] = await withTenant(tenantId, async (tx) => {
    const convo = await tx.conversation.findUniqueOrThrow({
      where: { id: conversationId, tenantId }, include: { assignedAgent: true },
    });
    const to = await tx.user.findUniqueOrThrow({ where: { id: toUserId, tenantId } });
    await tx.conversation.update({ where: { id: conversationId }, data: { assignedAgentId: toUserId } });
    return [convo, to];
  });

  await writeAuditLog({
    tenantId, userId: session.user.id, action: "inbox.transfer", targetType: "Conversation",
    targetId: conversationId,
    metaJson: { from: fromConvo.assignedAgent?.name ?? "غير مُسنَدة", to: toUser.name },
  });

  revalidatePath(`/dashboard/inbox/${conversationId}`);
  revalidatePath("/dashboard/inbox");
}

export async function takeOverFromBot(conversationId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "inbox.reply");
  const tenantId = session.user.tenantId;

  await withTenant(tenantId, (tx) =>
    tx.conversation.update({
      where: { id: conversationId, tenantId },
      data: { controlMode: "HUMAN", assignedAgentId: session.user.id },
    })
  );

  await writeAuditLog({ tenantId, userId: session.user.id, action: "inbox.takeover_from_bot", targetType: "Conversation", targetId: conversationId });

  revalidatePath(`/dashboard/inbox/${conversationId}`);
}

export async function addInternalNote(conversationId: string, formData: FormData) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "inbox.reply");
  const tenantId = session.user.tenantId;

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  await withTenant(tenantId, (tx) =>
    tx.internalNote.create({ data: { tenantId, conversationId, authorId: session.user.id, body } })
  );

  revalidatePath(`/dashboard/inbox/${conversationId}`);
}

export async function createQuickReply(formData: FormData) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "inbox.reply");
  const tenantId = session.user.tenantId;

  const shortcut = String(formData.get("shortcut") ?? "").trim().replace(/^\/+/, "");
  const body = String(formData.get("body") ?? "").trim();
  if (!shortcut || !body) throw new Error("الاختصار والنص مطلوبان");

  await withTenant(tenantId, (tx) =>
    tx.quickReply.create({ data: { tenantId, shortcut, body, createdByUserId: session.user.id } })
  );

  revalidatePath("/dashboard/inbox");
}

export async function deleteQuickReply(quickReplyId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "inbox.reply");
  const tenantId = session.user.tenantId;

  await withTenant(tenantId, (tx) => tx.quickReply.delete({ where: { id: quickReplyId, tenantId } }));

  revalidatePath("/dashboard/inbox");
}

/** أداة اختبار Sandbox فقط: تحاكي وصول رسالة عميل حقيقية عبر نفس مسار معالجة الـwebhook الفعلي. */
export async function simulateIncomingMessage(contactPhoneE164: string, contactName: string, kind: SimulatedMessageKind) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "inbox.reply");

  if (!(await isSandboxMode())) {
    throw new Error("محاكاة الرسائل الواردة متاحة فقط في وضع Sandbox.");
  }

  await simulateInboundMessage(session.user.tenantId, contactPhoneE164, contactName, kind);

  revalidatePath("/dashboard/inbox");
}
