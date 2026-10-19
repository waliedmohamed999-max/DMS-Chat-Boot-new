import crypto from "crypto";
import { superAdminDb } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/passwordResetTemplates";

export const RESET_TOKEN_TTL_MINUTES = 60;

/**
 * يُنشئ رابط تعيين كلمة مرور (AccountSetupToken، استخدام واحد، 60 دقيقة) ويرسله لبريد المستخدم. لا يمسّ
 * كلمة المرور الحالية. يُبطل أي رابط سابق لم يُستخدم. يرمي خطأ لو فشل إرسال البريد.
 * مستخدم من صفحة "نسيت كلمة المرور" ومن صفحة DMS داخل لوحة سلة (تاجر أُنشئ حسابه من تثبيت التطبيق).
 */
export async function sendPasswordResetLink(user: { id: string; email: string; name: string; tenantId: string | null }, meta: Record<string, string> = {}) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await superAdminDb.$transaction(async (tx) => {
    await tx.accountSetupToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await tx.accountSetupToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000) },
    });
    await tx.auditLog.create({
      data: { tenantId: user.tenantId, userId: user.id, action: "auth.password_reset_requested", targetType: "User", targetId: user.id, metaJson: meta },
    });
  });

  await sendEmail(passwordResetEmail({ to: user.email, name: user.name, token: rawToken, expiresInMinutes: RESET_TOKEN_TTL_MINUTES }));
}
