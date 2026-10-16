import type { EmailInput } from "@/lib/email/send";
import { baseUrl } from "@/lib/email/partnerTemplates";

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** يصل عند طلب المستخدم نفسه استعادة كلمة المرور من صفحة "نسيت كلمة المرور" — كلمة المرور الحالية
 * تبقى صالحة حتى يُستخدم الرابط فعلاً (خلافاً لـ internalStaffPasswordResetEmail القسري). */
export function passwordResetEmail(input: { to: string; name: string; token: string; expiresInMinutes: number }): EmailInput {
  const resetUrl = `${baseUrl()}/reset-password/${input.token}`;
  return {
    to: input.to,
    subject: "استعادة كلمة المرور — منصة DMS Tech",
    text: `مرحباً ${input.name}،\n\nوصلنا طلب لاستعادة كلمة مرور حسابك. حدِّد كلمة مرور جديدة عبر الرابط التالي خلال ${input.expiresInMinutes} دقيقة:\n${resetUrl}\n\nلو لم تطلب هذا، تجاهل الرسالة — كلمة مرورك الحالية لم تتغير.`,
    html: `<p>مرحباً ${escapeHtml(input.name)}،</p><p>وصلنا طلب لاستعادة كلمة مرور حسابك. حدِّد كلمة مرور جديدة عبر الزر التالي خلال ${input.expiresInMinutes} دقيقة:</p><p><a href="${resetUrl}" style="display:inline-block;background:#22c55e;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">تعيين كلمة مرور جديدة</a></p><p style="font-size:12px;color:#64748b">أو انسخ الرابط: <span dir="ltr">${resetUrl}</span></p><p>لو لم تطلب هذا، تجاهل الرسالة — كلمة مرورك الحالية لم تتغير.</p>`,
  };
}
