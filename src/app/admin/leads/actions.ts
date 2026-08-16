"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import type { ContactMessageStatus } from "@prisma/client";

export async function markLeadHandled(id: string) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.leads.view");
  await superAdminDb.contactMessage.update({ where: { id }, data: { handledAt: new Date(), status: "FOLLOWED_UP" } });
  revalidatePath("/admin/leads");
}

/** لا يمكن ضبط الحالة يدوياً إلى CONVERTED — تلك تُضبَط فقط تلقائياً عبر تدفق "تحويل إلى تاجر جديد" الفعلي. */
export async function setLeadStatus(id: string, status: Exclude<ContactMessageStatus, "CONVERTED">) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.leads.view");
  await superAdminDb.contactMessage.update({
    where: { id },
    data: { status, handledAt: status === "NEW" ? null : new Date() },
  });
  revalidatePath("/admin/leads");
}

export async function assignLead(id: string, userId: string | null) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.leads.view");
  await superAdminDb.contactMessage.update({ where: { id }, data: { assignedToUserId: userId } });
  revalidatePath("/admin/leads");
}
