"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission, ROLE_LABELS_AR } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { internalStaffInviteEmail } from "@/lib/email/internalStaffTemplates";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

const inviteSchema = z.object({
  name: z.string().min(2, "الاسم قصير جداً"),
  email: z.string().email("بريد إلكتروني غير صالح"),
  role: z.enum(["PLATFORM_SUPPORT", "PLATFORM_BILLING"]),
});

export type InviteStaffResult = { success: true } | { success: false; error: string };

/**
 * دعوة عضو فريق داخلي جديد — لا يُنشأ بكلمة مرور جاهزة أو مؤقتة تُبلَّغ له بأي شكل (كانت النسخة
 * السابقة تُولِّد `tempPassword` عشوائياً ثم تفقده فوراً بلا إرسال أو عرض — عضو مدعو لم يكن يقدر
 * فعلياً على تسجيل الدخول أبداً، فجوة حقيقية اكتُشفت أثناء المراجعة). يتبع الآن تماماً نفس آلية
 * "رابط إعداد حساب آمن" المستخدمة في نظام الشركاء (`AccountSetupToken`): كلمة مرور عشوائية غير
 * قابلة للاستخدام إطلاقاً، ورابط مُرسَل بالبريد يحدِّد فيه العضو كلمة مروره الحقيقية بنفسه.
 *
 * يُعيد نتيجة مكتوبة (بدل رمي استثناء) حتى تعرضها الواجهة العميلة كرسالة ودّية عند فشل التحقق أو
 * تكرار البريد، بدل ظهور شاشة خطأ Next.js غير معالجة (خلل حقيقي اكتُشف واختُبر أثناء هذه المراجعة).
 */
export async function inviteInternalStaff(formData: FormData): Promise<InviteStaffResult> {
  const session = await requireSuperAdminSession();
  requirePermission(session.user.role, "platform.team.manage");

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  const rateLimit = await checkTenantRateLimit(session.user.id, "invite-internal-staff", 20, 3600);
  if (!rateLimit.allowed) {
    return { success: false, error: "عدد دعوات كبير جداً خلال ساعة — حاول مرة أخرى لاحقاً." };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await superAdminDb.user.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "هذا البريد الإلكتروني مسجّل مسبقاً" };
  }

  const rawSetupToken = crypto.randomBytes(32).toString("hex");
  const setupTokenHash = crypto.createHash("sha256").update(rawSetupToken).digest("hex");
  const setupExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  await superAdminDb.$transaction(async (tx) => {
    const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    const user = await tx.user.create({
      data: { tenantId: null, name: parsed.data.name, email, role: parsed.data.role, passwordHash: placeholderHash },
    });
    await tx.accountSetupToken.create({ data: { userId: user.id, tokenHash: setupTokenHash, expiresAt: setupExpiresAt } });
    await tx.auditLog.create({
      data: { userId: session.user.id, action: "platform.team_invite", targetType: "User", targetId: email, metaJson: { role: parsed.data.role } },
    });
  });

  await sendEmail(internalStaffInviteEmail({ to: email, name: parsed.data.name, roleLabel: ROLE_LABELS_AR[parsed.data.role], setupToken: rawSetupToken }));

  revalidatePath("/admin/team");
  return { success: true };
}

export type ToggleStaffResult = { success: true } | { success: false; error: string };

export async function toggleInternalStaffActive(userId: string, isActive: boolean): Promise<ToggleStaffResult> {
  try {
    const session = await requireSuperAdminSession();
    requirePermission(session.user.role, "platform.team.manage");

    await superAdminDb.user.update({ where: { id: userId, tenantId: null }, data: { isActive } });
    await superAdminDb.auditLog.create({
      data: { userId: session.user.id, action: "platform.team_toggle_active", targetType: "User", targetId: userId, metaJson: { isActive } },
    });

    revalidatePath("/admin/team");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "حدث خطأ غير متوقع" };
  }
}

export type ChangeRoleResult = { success: true } | { success: false; error: string };

const staffRoleSchema = z.enum(["PLATFORM_SUPPORT", "PLATFORM_BILLING"]);

/** تغيير دور عضو داخلي حالي — مالك المنصة (SUPER_ADMIN) مستثنى دائماً حتى لا يفقد أحد كل الصلاحيات بالخطأ */
export async function changeInternalStaffRole(userId: string, newRole: string): Promise<ChangeRoleResult> {
  try {
    const session = await requireSuperAdminSession();
    requirePermission(session.user.role, "platform.team.manage");

    const parsed = staffRoleSchema.safeParse(newRole);
    if (!parsed.success) return { success: false, error: "دور غير صالح" };

    const target = await superAdminDb.user.findUnique({ where: { id: userId } });
    if (!target || target.tenantId !== null) return { success: false, error: "عضو غير موجود" };
    if (target.role === "SUPER_ADMIN") return { success: false, error: "لا يمكن تغيير دور مالك المنصة" };

    await superAdminDb.user.update({ where: { id: userId }, data: { role: parsed.data } });
    await superAdminDb.auditLog.create({
      data: { userId: session.user.id, action: "platform.team_change_role", targetType: "User", targetId: userId, metaJson: { newRole: parsed.data } },
    });

    revalidatePath("/admin/team");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "حدث خطأ غير متوقع" };
  }
}

export type RemoveStaffResult = { success: true } | { success: false; error: string };

/** حذف عضو فريق داخلي نهائياً — لا بيانات تينانت مرتبطة به (بخلاف حذف تاجر)، فالحذف الفعلي آمن ومباشر هنا */
export async function removeInternalStaff(userId: string): Promise<RemoveStaffResult> {
  try {
    const session = await requireSuperAdminSession();
    requirePermission(session.user.role, "platform.team.manage");

    if (userId === session.user.id) return { success: false, error: "لا يمكنك حذف حسابك الخاص" };

    const target = await superAdminDb.user.findUnique({ where: { id: userId } });
    if (!target || target.tenantId !== null) return { success: false, error: "عضو غير موجود" };
    if (target.role === "SUPER_ADMIN") return { success: false, error: "لا يمكن حذف مالك المنصة" };

    await superAdminDb.$transaction(async (tx) => {
      await tx.user.delete({ where: { id: userId } });
      await tx.auditLog.create({
        data: { userId: session.user.id, action: "platform.team_remove", targetType: "User", targetId: userId, metaJson: { email: target.email } },
      });
    });

    revalidatePath("/admin/team");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "حدث خطأ غير متوقع" };
  }
}

export type ResendSetupLinkResult = { success: true } | { success: false; error: string };

/** إعادة إرسال رابط إعداد الحساب لعضو لم يُكمل إعداد كلمة مروره بعد — يُبطل أي رمز سابق وينشئ رمزاً جديداً */
export async function resendStaffSetupLink(userId: string): Promise<ResendSetupLinkResult> {
  try {
    const session = await requireSuperAdminSession();
    requirePermission(session.user.role, "platform.team.manage");

    const rateLimit = await checkTenantRateLimit(session.user.id, "resend-staff-setup-link", 20, 3600);
    if (!rateLimit.allowed) return { success: false, error: "عدد محاولات كبير جداً خلال ساعة — حاول مرة أخرى لاحقاً." };

    const target = await superAdminDb.user.findUnique({ where: { id: userId } });
    if (!target || target.tenantId !== null) return { success: false, error: "عضو غير موجود" };

    const rawSetupToken = crypto.randomBytes(32).toString("hex");
    const setupTokenHash = crypto.createHash("sha256").update(rawSetupToken).digest("hex");
    const setupExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    await superAdminDb.$transaction(async (tx) => {
      await tx.accountSetupToken.deleteMany({ where: { userId, usedAt: null } });
      await tx.accountSetupToken.create({ data: { userId, tokenHash: setupTokenHash, expiresAt: setupExpiresAt } });
      await tx.auditLog.create({
        data: { userId: session.user.id, action: "platform.team_resend_setup", targetType: "User", targetId: userId, metaJson: {} },
      });
    });

    await sendEmail(internalStaffInviteEmail({ to: target.email, name: target.name, roleLabel: ROLE_LABELS_AR[target.role], setupToken: rawSetupToken }));

    revalidatePath("/admin/team");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "حدث خطأ غير متوقع" };
  }
}
