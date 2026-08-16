"use server";

// هذا المسار (partners/setup/[token]) يُستخدم الآن لإعداد حساب في حالتين: تاجر شريك اعتُمد طلبه
// (له تينانت)، أو عضو فريق منصة داخلي دُعي حديثاً (بلا تينانت — admin/team). الآلية الأمنية (رمز
// مُجزَّأ + صلاحية + استخدام واحد) مطابقة تماماً في الحالتين، فلم يكن هناك داعٍ لمسار/جدول منفصل.
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { superAdminDb } from "@/lib/db";

export type CompleteSetupResult = { success: true } | { success: false; error: string };
export type SetupTokenInfo = { valid: true; ownerName: string; tenantName: string | null } | { valid: false };

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** يُستدعى عند عرض الصفحة فقط للتحقق المبكر من صلاحية الرابط قبل ملء النموذج، وليس للاعتماد الأمني الفعلي (ذلك في completePartnerSetup). */
export async function getSetupTokenInfo(token: string): Promise<SetupTokenInfo> {
  const tokenHash = hashToken(token);
  const setupToken = await superAdminDb.accountSetupToken.findUnique({
    where: { tokenHash },
    include: { user: { include: { tenant: true } } },
  });
  if (!setupToken || setupToken.usedAt || setupToken.expiresAt < new Date()) return { valid: false };
  return { valid: true, ownerName: setupToken.user.name, tenantName: setupToken.user.tenant?.name ?? null };
}

export async function completePartnerSetup(token: string, formData: FormData): Promise<CompleteSetupResult> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return { success: false, error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" };
  }
  if (password !== confirmPassword) {
    return { success: false, error: "كلمتا المرور غير متطابقتين" };
  }

  const tokenHash = hashToken(token);
  const setupToken = await superAdminDb.accountSetupToken.findUnique({ where: { tokenHash } });

  if (!setupToken || setupToken.usedAt || setupToken.expiresAt < new Date()) {
    return { success: false, error: "رابط إعداد الحساب غير صالح أو منتهي الصلاحية. تواصل مع الدعم للحصول على رابط جديد." };
  }

  await superAdminDb.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: setupToken.userId },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    await tx.accountSetupToken.update({ where: { id: setupToken.id }, data: { usedAt: new Date() } });
  });

  return { success: true };
}
