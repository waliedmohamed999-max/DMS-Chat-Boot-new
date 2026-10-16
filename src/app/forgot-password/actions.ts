"use server";

import crypto from "crypto";
import { headers } from "next/headers";
import { superAdminDb } from "@/lib/db";
import { checkIpRateLimit, checkTenantRateLimit } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/passwordResetTemplates";

const RESET_TOKEN_TTL_MINUTES = 60;

export type RequestResetResult = { success: true } | { success: false; error: string };

/**
 * استعادة كلمة المرور ذاتياً (تاجر أو عضو فريق منصة). يعيد نفس الرد "تم" سواء البريد مسجَّل أم لا،
 * لمنع استكشاف الحسابات المسجَّلة. لا يمسّ كلمة المرور الحالية إطلاقاً — يُنشئ رابطاً قصير الصلاحية
 * فقط، وإلا لاستطاع أي شخص يعرف بريد تاجر إبطال كلمة مروره وقفل حسابه بمجرد طلب استعادة.
 * الرابط يستخدم نفس جدول AccountSetupToken ونفس منطق الإكمال (partners/setup) المُدقَّق مسبقاً.
 */
export async function requestPasswordReset(formData: FormData): Promise<RequestResetResult> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: "أدخل بريداً إلكترونياً صحيحاً" };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "password-reset", 10, 3600);
  if (!ipLimit.allowed) return { success: false, error: "عدد طلبات كبير جداً — حاول مرة أخرى بعد ساعة." };
  const emailLimit = await checkTenantRateLimit(email, "password-reset", 3, 3600);
  if (!emailLimit.allowed) return { success: true }; // نفس الرد العام — لا نكشف أن هذا البريد طُلب له مسبقاً

  const user = await superAdminDb.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return { success: true };

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await superAdminDb.$transaction(async (tx) => {
    await tx.accountSetupToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await tx.accountSetupToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000) },
    });
    await tx.auditLog.create({
      data: { tenantId: user.tenantId, userId: user.id, action: "auth.password_reset_requested", targetType: "User", targetId: user.id, metaJson: { ip } },
    });
  });

  try {
    await sendEmail(passwordResetEmail({ to: user.email, name: user.name, token: rawToken, expiresInMinutes: RESET_TOKEN_TTL_MINUTES }));
  } catch (err) {
    console.error("password reset email failed:", err);
    return { success: false, error: "تعذّر إرسال البريد حالياً، حاول لاحقاً أو تواصل مع الدعم." };
  }
  return { success: true };
}
