"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";

/** نظير admin/chats/actions.ts::takeOverSession، لكن عبر withTenant() لأن TenantChatSession بيانات
 * تاجر خاضعة لـRLS — يعيّن الموظف الحالي، ويحوّل الحالة لـHANDED_OFF فقط لو كانت لسه OPEN. */
export async function takeOverTenantChatSession(sessionId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.edit");
  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    const current = await tx.tenantChatSession.findUniqueOrThrow({ where: { id: sessionId } });
    await tx.tenantChatSession.update({
      where: { id: sessionId },
      data: { assignedToUserId: session.user.id, ...(current.status === "OPEN" ? { status: "HANDED_OFF" } : {}) },
    });
  });

  revalidatePath("/dashboard/website-chat/sessions");
}

export async function sendTenantStaffReply(sessionId: string, text: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.edit");
  const tenantId = session.user.tenantId;
  const trimmed = text.trim();
  if (!trimmed) throw new Error("نص الرسالة مطلوب");

  await withTenant(tenantId, async (tx) => {
    await tx.tenantChatMessage.create({ data: { tenantId, sessionId, senderType: "STAFF", text: trimmed } });
    await tx.tenantChatSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });
  });

  revalidatePath("/dashboard/website-chat/sessions");
}
