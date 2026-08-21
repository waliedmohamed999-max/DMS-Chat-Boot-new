"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import type { AnnouncementAudience, AnnouncementSeverity, AnnouncementStatus } from "@prisma/client";

function parseFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const audienceType = String(formData.get("audienceType") ?? "ALL") as AnnouncementAudience;
  const audiencePlanId = String(formData.get("audiencePlanId") ?? "") || null;
  const severity = String(formData.get("severity") ?? "INFO") as AnnouncementSeverity;
  const dismissible = formData.get("dismissible") === "on";
  const tenantSlugsRaw = String(formData.get("tenantSlugs") ?? "").trim();
  const scheduledFor = String(formData.get("scheduledFor") ?? "").trim() || null;
  const expiresAt = String(formData.get("expiresAt") ?? "").trim() || null;
  return { title, body, audienceType, audiencePlanId, severity, dismissible, tenantSlugsRaw, scheduledFor, expiresAt };
}

async function resolveTenantIdsFromSlugs(slugsRaw: string): Promise<string[] | undefined> {
  if (!slugsRaw) return undefined;
  const slugs = slugsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const tenants = await superAdminDb.tenant.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
  return tenants.map((t) => t.id);
}

/** إنشاء إعلان جديد — الزر المضغوط يحدّد name="intent" value="draft"|"publish" في الـFormData. لو
 * "publish" و scheduledFor في المستقبل → SCHEDULED، لو فاضي أو ماضي → SENT فوراً. */
export async function saveAnnouncement(formData: FormData) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.announcements.send");

  const intent = String(formData.get("intent") ?? "publish");
  const f = parseFields(formData);
  if (!f.title || !f.body) throw new Error("العنوان والنص مطلوبان");

  const scheduledForDate = f.scheduledFor ? new Date(f.scheduledFor) : null;
  const expiresAtDate = f.expiresAt ? new Date(f.expiresAt) : null;
  if (expiresAtDate && scheduledForDate && expiresAtDate <= scheduledForDate) {
    throw new Error("تاريخ الانتهاء يجب أن يكون بعد تاريخ الجدولة");
  }

  const now = new Date();
  let status: AnnouncementStatus = "SENT";
  let sentAt: Date | null = now;
  if (intent === "draft") {
    status = "DRAFT";
    sentAt = null;
  } else if (scheduledForDate && scheduledForDate > now) {
    status = "SCHEDULED";
    sentAt = null;
  }

  const audienceTenantIdsJson =
    f.audienceType === "SPECIFIC_TENANTS" ? await resolveTenantIdsFromSlugs(f.tenantSlugsRaw) : undefined;

  await superAdminDb.platformAnnouncement.create({
    data: {
      title: f.title, body: f.body, audienceType: f.audienceType,
      audiencePlanId: f.audienceType === "SPECIFIC_PLAN" ? f.audiencePlanId : null,
      audienceTenantIdsJson: audienceTenantIdsJson as never,
      severity: f.severity, dismissible: f.dismissible,
      status, scheduledFor: scheduledForDate, expiresAt: expiresAtDate, sentAt,
      createdByUserId: session.user.id,
    },
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: `platform.announcement_${status.toLowerCase()}`, targetType: "PlatformAnnouncement", metaJson: { title: f.title, audienceType: f.audienceType, status } },
  });

  revalidatePath("/admin/announcements");
}

/** تعديل — مسموح فقط لو الإعلان لسه DRAFT أو SCHEDULED (لم يُعرَض على أي تاجر بعد فعلياً). نفس منطق
 * saveAnnouncement تماماً لكن update() بدل create(). */
export async function updateAnnouncement(id: string, formData: FormData) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.announcements.send");

  const existing = await superAdminDb.platformAnnouncement.findUnique({ where: { id }, select: { status: true } });
  if (!existing || (existing.status !== "DRAFT" && existing.status !== "SCHEDULED")) {
    throw new Error("لا يمكن تعديل إعلان تم إرساله بالفعل — استخدم «حذف» أو «تكرار» بدلاً من ذلك");
  }

  const intent = String(formData.get("intent") ?? "publish");
  const f = parseFields(formData);
  if (!f.title || !f.body) throw new Error("العنوان والنص مطلوبان");

  const scheduledForDate = f.scheduledFor ? new Date(f.scheduledFor) : null;
  const expiresAtDate = f.expiresAt ? new Date(f.expiresAt) : null;
  if (expiresAtDate && scheduledForDate && expiresAtDate <= scheduledForDate) {
    throw new Error("تاريخ الانتهاء يجب أن يكون بعد تاريخ الجدولة");
  }

  const now = new Date();
  let status: AnnouncementStatus = "SENT";
  let sentAt: Date | null = now;
  if (intent === "draft") { status = "DRAFT"; sentAt = null; }
  else if (scheduledForDate && scheduledForDate > now) { status = "SCHEDULED"; sentAt = null; }

  const audienceTenantIdsJson =
    f.audienceType === "SPECIFIC_TENANTS" ? await resolveTenantIdsFromSlugs(f.tenantSlugsRaw) : undefined;

  await superAdminDb.platformAnnouncement.update({
    where: { id },
    data: {
      title: f.title, body: f.body, audienceType: f.audienceType,
      audiencePlanId: f.audienceType === "SPECIFIC_PLAN" ? f.audiencePlanId : null,
      audienceTenantIdsJson: audienceTenantIdsJson as never,
      severity: f.severity, dismissible: f.dismissible,
      status, scheduledFor: scheduledForDate, expiresAt: expiresAtDate, sentAt,
    },
  });

  revalidatePath("/admin/announcements");
}

export async function deleteAnnouncement(id: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.announcements.send");
  await superAdminDb.platformAnnouncement.delete({ where: { id } }); // onDelete: Cascade يحذف الـviews/dismissals تلقائياً
  await superAdminDb.auditLog.create({ data: { userId: session.user.id, action: "platform.announcement_deleted", targetType: "PlatformAnnouncement", metaJson: { id } } });
  revalidatePath("/admin/announcements");
}

/** تكرار: ينشئ نسخة DRAFT جديدة من إعلان موجود (أي حالة) — يوفّر إعادة الكتابة، ويظهر جاهزاً للتعديل
 * والإرسال من قسم "مسودات" في الصفحة. */
export async function duplicateAnnouncement(id: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.announcements.send");
  const src = await superAdminDb.platformAnnouncement.findUnique({ where: { id } });
  if (!src) throw new Error("الإعلان غير موجود");
  await superAdminDb.platformAnnouncement.create({
    data: {
      title: `${src.title} (نسخة)`, body: src.body, audienceType: src.audienceType,
      audiencePlanId: src.audiencePlanId, audienceTenantIdsJson: src.audienceTenantIdsJson as never,
      severity: src.severity, dismissible: src.dismissible,
      status: "DRAFT", createdByUserId: session.user.id,
    },
  });
  revalidatePath("/admin/announcements");
}
