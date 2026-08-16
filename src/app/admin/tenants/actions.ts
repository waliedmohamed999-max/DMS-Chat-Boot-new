"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { startImpersonation } from "@/lib/impersonation";
import { getPlatformSettings } from "@/lib/platformSettings";
import { sendEmail } from "@/lib/email/send";
import { partnerApplicationApprovedEmail } from "@/lib/email/partnerTemplates";
import { approveNewTenant, rejectRequest } from "@/app/admin/approvals/actions";

export type CreateTenantManuallyResult = { success: true; tenantId: string } | { success: false; error: string };

/**
 * إنشاء تاجر مباشرة من فريق المنصة (بند 3 في برومنت التدقيق الشامل) — يتجاوز مركز الموافقات كلياً
 * (لا يوجد طلب معلَّق يُراجَع)، لكن يُطبَّق **نفس منطق التفعيل** المستخدَم فعلياً عند قبول طلب شريك
 * حقيقي (`approvePartnerApplication` أعلاه في admin/approvals/actions.ts): تينانت TRIAL جاهز فوراً
 * بالباقة المختارة، مستخدم Owner بكلمة مرور عشوائية غير قابلة للاستخدام، ثم رابط إعداد حساب آمن
 * (نفس بريد "أكمل إعداد حسابك" الذي يصل لأي تاجر آخر — لا فرق في تجربة الإعداد). يخدم مبيعات
 * الهاتف/عملاء VIP/تجار تجريبيين (استخدام صريح مذكور في البرومنت).
 */
export async function createTenantManually(formData: FormData): Promise<CreateTenantManuallyResult> {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.approvals.review");

  const storeName = String(formData.get("storeName") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();
  const ownerPhone = String(formData.get("ownerPhone") ?? "").trim();
  const planId = String(formData.get("planId") ?? "");
  const leadId = String(formData.get("leadId") ?? "").trim() || null;

  if (!storeName) return { success: false, error: "اسم المتجر مطلوب" };
  if (!ownerName) return { success: false, error: "اسم المالك مطلوب" };
  if (!ownerEmail || !ownerEmail.includes("@")) return { success: false, error: "بريد إلكتروني غير صالح" };
  if (!planId) return { success: false, error: "اختيار الباقة مطلوب" };

  const emailTaken = await superAdminDb.user.findUnique({ where: { email: ownerEmail } });
  if (emailTaken) return { success: false, error: "هذا البريد الإلكتروني مستخدَم بالفعل لحساب آخر" };

  const plan = await superAdminDb.plan.findUnique({ where: { id: planId } });
  if (!plan) return { success: false, error: "الباقة المختارة غير موجودة" };

  const platformSettings = await getPlatformSettings();

  let slug = slugify(storeName);
  const slugTaken = await superAdminDb.tenant.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const rawSetupToken = crypto.randomBytes(32).toString("hex");
  const setupTokenHash = crypto.createHash("sha256").update(rawSetupToken).digest("hex");
  const setupExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const tenantId = await superAdminDb.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { slug, name: storeName, status: "TRIAL", joinSource: "MANUAL_ADMIN" } });

    // نفس قاعدة كلمة المرور المستخدَمة في approvePartnerApplication — عشوائية وغير مُبلَّغة لأحد،
    // الحساب لا يصبح قابلاً لتسجيل الدخول إلا بعد إكمال رابط إعداد الحساب.
    const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    const owner = await tx.user.create({
      data: { tenantId: tenant.id, name: ownerName, email: ownerEmail, passwordHash: placeholderHash, role: "OWNER" },
    });

    await tx.subscription.create({
      data: {
        tenantId: tenant.id, planId: plan.id, status: "TRIALING",
        currentPeriodEnd: new Date(Date.now() + platformSettings.defaultTrialDays * 24 * 3600 * 1000),
      },
    });

    for (const provider of ["META_WHATSAPP", "ZID", "SALLA"] as const) {
      await tx.integration.create({ data: { tenantId: tenant.id, provider, status: "DISCONNECTED", isSandbox: true } });
    }

    await tx.accountSetupToken.create({ data: { userId: owner.id, tokenHash: setupTokenHash, expiresAt: setupExpiresAt } });

    if (ownerPhone) {
      await tx.merchantNote.create({
        data: { tenantId: tenant.id, authorId: session.user.id, body: `تم إنشاء الحساب يدوياً — رقم تواصل المالك: ${ownerPhone}` },
      });
    }

    if (leadId) {
      await tx.contactMessage.update({
        where: { id: leadId },
        data: { status: "CONVERTED", handledAt: new Date(), convertedTenantId: tenant.id },
      });
    }

    return tenant.id;
  });

  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, action: "platform.tenant_create_manual",
      targetType: "Tenant", targetId: tenantId, metaJson: { storeName, ownerEmail, planKey: plan.key, convertedFromLeadId: leadId },
    },
  });

  await sendEmail(partnerApplicationApprovedEmail({ to: ownerEmail, ownerName, setupToken: rawSetupToken }));

  revalidatePath("/admin/tenants");
  if (leadId) revalidatePath("/admin/leads");
  return { success: true, tenantId };
}

export async function setTenantStatus(tenantId: string, status: "ACTIVE" | "SUSPENDED") {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.merchants.suspend");

  await superAdminDb.tenant.update({ where: { id: tenantId }, data: { status } });

  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, action: "platform.tenant_status_change",
      targetType: "Tenant", targetId: tenantId, metaJson: { newStatus: status },
    },
  });

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function changeTenantPlan(tenantId: string, planId: string) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.merchants.change_plan");

  const plan = await superAdminDb.plan.findUniqueOrThrow({ where: { id: planId } });

  await superAdminDb.subscription.upsert({
    where: { tenantId },
    update: { planId, status: "ACTIVE" },
    create: { tenantId, planId, status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
  });

  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, action: "platform.tenant_plan_change_manual",
      targetType: "Tenant", targetId: tenantId, metaJson: { newPlan: plan.key },
    },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function deleteTenantPermanently(tenantId: string, confirmSlug: string) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.merchants.delete");

  const tenant = await superAdminDb.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (confirmSlug !== tenant.slug) {
    throw new Error("التأكيد غير مطابق — اكتب معرّف المتجر بالضبط للمتابعة");
  }

  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, action: "platform.tenant_delete",
      targetType: "Tenant", targetId: tenantId, metaJson: { tenantName: tenant.name, tenantSlug: tenant.slug },
    },
  });

  await superAdminDb.tenant.delete({ where: { id: tenantId } });

  redirect("/admin/tenants");
}

export async function toggleMerchantUserActive(tenantId: string, userId: string, isActive: boolean) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.merchants.suspend");

  await superAdminDb.user.update({ where: { id: userId, tenantId }, data: { isActive } });

  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, action: "platform.merchant_user_toggle_active",
      targetType: "User", targetId: userId, metaJson: { tenantId, isActive },
    },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
}

/**
 * تغيير كلمة مرور مستخدم تاجر مباشرة من لوحة مالك المنصة — للحالات اللي التاجر ما يقدرش يوصل
 * لحسابه (نسي كلمة المرور، ما استلمش/ضاع رابط إعداد الحساب الأول). صلاحية مقصورة على SUPER_ADMIN
 * فقط (نفس تقييد platform.merchants.impersonate) لأنها أخطر من الانتحال المؤقت: تغيير دائم لبيانات
 * الدخول الفعلية يبقى بعد انتهاء أي جلسة، بعكس جلسة الانتحال المؤقتة (30 دقيقة) المُنهية تلقائياً.
 * لا تُسجَّل كلمة المرور الجديدة نفسها في سجل التدقيق — فقط حدث التغيير ومنفّذه.
 */
export async function resetMerchantPassword(tenantId: string, userId: string, newPassword: string) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.merchants.reset_password");

  if (newPassword.length < 8) throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");

  const user = await superAdminDb.user.findUniqueOrThrow({ where: { id: userId, tenantId } });
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await superAdminDb.user.update({ where: { id: userId }, data: { passwordHash } });

  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, action: "platform.merchant_password_reset",
      targetType: "User", targetId: userId, metaJson: { tenantId, targetEmail: user.email },
    },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function addMerchantNote(tenantId: string, formData: FormData) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.merchants.notes");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  await superAdminDb.merchantNote.create({
    data: { tenantId, authorId: session.user.id, body },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function startImpersonationAction(tenantId: string) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.merchants.impersonate");

  await startImpersonation(tenantId, session.user.id);

  redirect("/dashboard");
}

/**
 * اختصار "قبول" مباشر من جدول التجار (بند ب في البرومنت) — يبحث عن طلب NEW_TENANT المُعلَّق لهذا
 * التاجر تحديداً، ثم يستدعي **نفس** `approveNewTenant` المستخدَمة في مركز الموافقات حرفياً (لا
 * تكرار منطق) لضمان تطابق النتيجة تماماً بين المسارين.
 */
export async function quickApproveNewTenant(tenantId: string) {
  const request = await superAdminDb.approvalRequest.findFirst({
    where: { tenantId, type: "NEW_TENANT", status: "PENDING" },
  });
  if (!request) throw new Error("لا يوجد طلب تسجيل معلَّق لهذا التاجر");
  await approveNewTenant(request.id);
}

/** اختصار "رفض" مباشر من جدول التجار — نفس مبدأ quickApproveNewTenant أعلاه. */
export async function quickRejectNewTenant(tenantId: string, formData: FormData) {
  const request = await superAdminDb.approvalRequest.findFirst({
    where: { tenantId, type: "NEW_TENANT", status: "PENDING" },
  });
  if (!request) throw new Error("لا يوجد طلب تسجيل معلَّق لهذا التاجر");
  await rejectRequest(request.id, formData);
}

/** تمديد فترة تجربة تاجر بعدد أيام يحدده الأدمن — يضيف للنهاية الحالية للدورة، وليس من تاريخ اليوم
 * (لو مُدِّدت مسبقاً، لا يُفقَد التمديد السابق). */
export async function extendTrial(tenantId: string, days: number) {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.merchants.suspend");
  if (!Number.isFinite(days) || days <= 0 || days > 90) throw new Error("عدد أيام غير صالح (1-90)");

  const subscription = await superAdminDb.subscription.findUnique({ where: { tenantId } });
  if (!subscription) throw new Error("لا يوجد اشتراك لهذا التاجر");

  const newPeriodEnd = new Date(subscription.currentPeriodEnd.getTime() + days * 86400000);
  await superAdminDb.subscription.update({ where: { tenantId }, data: { currentPeriodEnd: newPeriodEnd } });

  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, action: "platform.tenant_trial_extend",
      targetType: "Tenant", targetId: tenantId, metaJson: { days, newPeriodEnd },
    },
  });

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${tenantId}`);
}
