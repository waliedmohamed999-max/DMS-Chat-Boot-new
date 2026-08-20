import type { EmailInput } from "@/lib/email/send";
import { baseUrl } from "@/lib/email/partnerTemplates";

// name يُدخله مالك المنصة نفسه (مصادَق ومصرَّح له بالفعل)، لكن يُهرَّب دفاعاً في العمق بنفس نمط
// كل قوالب البريد الأخرى في المشروع — لا كلفة إضافية تُذكر مقابل هذا الاتساق.
function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** يصل عند دعوة عضو جديد في فريق المنصة الداخلي (admin/team) — رابط إعداد حساب آمن بدل كلمة مرور مؤقتة مفقودة. */
export function internalStaffInviteEmail(input: { to: string; name: string; roleLabel: string; setupToken: string }): EmailInput {
  const setupUrl = `${baseUrl()}/partners/setup/${input.setupToken}`;
  return {
    to: input.to,
    subject: "دُعيت للانضمام لفريق منصة DMS",
    text: `مرحباً ${input.name}،\n\nتمت دعوتك للانضمام لفريق منصة DMS بدور "${input.roleLabel}".\n\nأكمل إعداد حسابك (تحديد كلمة مرور) عبر الرابط التالي خلال 7 أيام:\n${setupUrl}\n\nبعد إكمال الإعداد يمكنك تسجيل الدخول مباشرة.`,
    html: `<p>مرحباً ${escapeHtml(input.name)}،</p><p>تمت دعوتك للانضمام لفريق منصة DMS بدور "${escapeHtml(input.roleLabel)}".</p><p>أكمل إعداد حسابك (تحديد كلمة مرور) عبر الرابط التالي خلال 7 أيام:</p><p><a href="${setupUrl}">${setupUrl}</a></p><p>بعد إكمال الإعداد يمكنك تسجيل الدخول مباشرة.</p>`,
  };
}

/** يصل عند إعادة تعيين كلمة مرور عضو في فريق المنصة الداخلي قسراً (admin/team) — يوضّح أن كلمة
 * المرور القديمة أُبطلت فعلاً فوراً، خلافاً لدعوة عضو جديد. */
export function internalStaffPasswordResetEmail(input: { to: string; name: string; setupToken: string }): EmailInput {
  const setupUrl = `${baseUrl()}/partners/setup/${input.setupToken}`;
  return {
    to: input.to,
    subject: "تم إبطال كلمة مرور حسابك في منصة DMS",
    text: `مرحباً ${input.name}،\n\nتم إبطال كلمة مرور حسابك الحالية بواسطة مالك المنصة. حدِّد كلمة مرور جديدة عبر الرابط التالي خلال 7 أيام:\n${setupUrl}\n\nلو لم تطلب هذا الإجراء، تواصل مع مالك المنصة فوراً.`,
    html: `<p>مرحباً ${escapeHtml(input.name)}،</p><p>تم إبطال كلمة مرور حسابك الحالية بواسطة مالك المنصة. حدِّد كلمة مرور جديدة عبر الرابط التالي خلال 7 أيام:</p><p><a href="${setupUrl}">${setupUrl}</a></p><p>لو لم تطلب هذا الإجراء، تواصل مع مالك المنصة فوراً.</p>`,
  };
}
