"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";

export async function createAnnouncement(formData: FormData) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.announcements.send");

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const audienceType = String(formData.get("audienceType") ?? "ALL") as "ALL" | "SPECIFIC_PLAN" | "SPECIFIC_TENANTS";
  const audiencePlanId = String(formData.get("audiencePlanId") ?? "") || null;
  const tenantSlugsRaw = String(formData.get("tenantSlugs") ?? "").trim();

  if (!title || !body) throw new Error("العنوان والنص مطلوبان");

  let audienceTenantIdsJson: string[] | undefined;
  if (audienceType === "SPECIFIC_TENANTS" && tenantSlugsRaw) {
    const slugs = tenantSlugsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const tenants = await superAdminDb.tenant.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
    audienceTenantIdsJson = tenants.map((t) => t.id);
  }

  await superAdminDb.platformAnnouncement.create({
    data: {
      title, body, audienceType,
      audiencePlanId: audienceType === "SPECIFIC_PLAN" ? audiencePlanId : null,
      audienceTenantIdsJson: audienceTenantIdsJson as never,
      createdByUserId: session.user.id,
    },
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.announcement_sent", targetType: "PlatformAnnouncement", metaJson: { title, audienceType } },
  });

  revalidatePath("/admin/announcements");
}
