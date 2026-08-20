import type { EmailInput } from "@/lib/email/send";
import { baseUrl } from "@/lib/email/partnerTemplates";

// message/reason نص حر يكتبه الأدمن، typeLabel/ownerName من بيانات التاجر نفسها — كلها تُهرَّب دفاعاً
// في العمق قبل إدراجها في HTML بريد فعلي، بنفس نمط partnerTemplates.ts تماماً.
function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** يصل لصاحب حساب تاجر قائم (NEW_TENANT/WHATSAPP_VERIFICATION/MESSAGE_TEMPLATE/CUSTOM_PLAN) عند طلب
 * معلومات إضافية على طلب مرتبط بحسابه — خلافاً لـpartnerApplicationNeedsInfoEmail المخصصة لمتقدّم
 * عام بلا حساب بعد. */
export function tenantApprovalNeedsInfoEmail(input: { to: string; ownerName: string; typeLabel: string; message: string }): EmailInput {
  const dashboardUrl = `${baseUrl()}/dashboard`;
  return {
    to: input.to,
    subject: `نحتاج معلومات إضافية بخصوص طلب "${input.typeLabel}"`,
    text: `مرحباً ${input.ownerName}،\n\nيحتاج فريقنا معلومات إضافية لإكمال مراجعة طلبك بخصوص "${input.typeLabel}":\n${input.message}\n\nيمكنك متابعة حسابك والرد عبر لوحة التحكم:\n${dashboardUrl}\n\nلأي استفسار، يسعدنا تواصلك مع فريق الدعم.`,
    html: `<p>مرحباً ${escapeHtml(input.ownerName)}،</p><p>يحتاج فريقنا معلومات إضافية لإكمال مراجعة طلبك بخصوص "${escapeHtml(input.typeLabel)}":</p><blockquote>${escapeHtml(input.message)}</blockquote><p>يمكنك متابعة حسابك والرد عبر لوحة التحكم:</p><p><a href="${dashboardUrl}">${dashboardUrl}</a></p><p>لأي استفسار، يسعدنا تواصلك مع فريق الدعم.</p>`,
  };
}

/** يصل لصاحب حساب تاجر قائم عند رفض طلب مرتبط بحسابه — خلافاً لـpartnerApplicationRejectedEmail
 * المخصصة لمتقدّم عام لم يُنشأ له حساب بعد. */
export function tenantApprovalRejectedEmail(input: { to: string; ownerName: string; typeLabel: string; reason: string }): EmailInput {
  const dashboardUrl = `${baseUrl()}/dashboard`;
  return {
    to: input.to,
    subject: `بخصوص طلب "${input.typeLabel}"`,
    text: `مرحباً ${input.ownerName}،\n\nنأسف لإبلاغك بأنه تم رفض طلبك بخصوص "${input.typeLabel}" للسبب التالي:\n${input.reason}\n\nيمكنك مراجعة حسابك عبر لوحة التحكم:\n${dashboardUrl}\n\nإن كان لديك أي استفسار، يسعدنا تواصلك مع فريق الدعم.`,
    html: `<p>مرحباً ${escapeHtml(input.ownerName)}،</p><p>نأسف لإبلاغك بأنه تم رفض طلبك بخصوص "${escapeHtml(input.typeLabel)}" للسبب التالي:</p><blockquote>${escapeHtml(input.reason)}</blockquote><p>يمكنك مراجعة حسابك عبر لوحة التحكم:</p><p><a href="${dashboardUrl}">${dashboardUrl}</a></p><p>إن كان لديك أي استفسار، يسعدنا تواصلك مع فريق الدعم.</p>`,
  };
}
