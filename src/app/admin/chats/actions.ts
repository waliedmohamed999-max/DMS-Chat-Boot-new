"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";

/** تولّي المحادثة: يعيّن الموظف الحالي، ويحوّل الحالة لـHANDED_OFF فقط لو كانت لسه OPEN (إعادة تعيين
 * جلسة محوَّلة بالفعل لموظف آخر لا يعيدها لوضع "الموظف الذكي يرد" — يبقى بشرياً). */
export async function takeOverSession(sessionId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.chats.view");
  const current = await superAdminDb.platformChatSession.findUniqueOrThrow({ where: { id: sessionId } });

  await superAdminDb.platformChatSession.update({
    where: { id: sessionId },
    data: { assignedToUserId: session.user.id, ...(current.status === "OPEN" ? { status: "HANDED_OFF" } : {}) },
  });

  revalidatePath("/admin/chats");
}

export async function sendStaffReply(sessionId: string, text: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.chats.view");
  const trimmed = text.trim();
  if (!trimmed) throw new Error("نص الرسالة مطلوب");

  await superAdminDb.platformChatMessage.create({ data: { sessionId, senderType: "STAFF", text: trimmed } });
  await superAdminDb.platformChatSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });

  revalidatePath("/admin/chats");
}
