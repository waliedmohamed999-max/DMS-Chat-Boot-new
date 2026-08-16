import type { EmailInput } from "@/lib/email/send";

export function baseUrl(): string {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

// ownerName مُدخَل من متقدّم عام غير موثوق (نموذج partners/apply)، وreason/message من نص حر يكتبه
// الأدمن — كلاهما يجب تهريبه قبل إدراجه في HTML بريد فعلي، وإلا أمكن حقن HTML داخل رسالة تصل لصندوق
// بريد حقيقي (خصوصاً ownerName، القابل للتحكم الكامل من أي زائر عام بلا أي مصادقة).
function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function partnerApplicationReceivedEmail(input: { to: string; ownerName: string; referenceId: string }): EmailInput {
  const statusUrl = `${baseUrl()}/partners/status`;
  return {
    to: input.to,
    subject: "تم استلام طلب انضمامك — منصة DMS",
    text: `مرحباً ${input.ownerName}،\n\nتم استلام طلب انضمامك بنجاح وهو الآن قيد مراجعة فريقنا.\n\nرقم طلبك: ${input.referenceId}\nيمكنك متابعة حالة طلبك في أي وقت عبر: ${statusUrl}\n\nسنراسلك فور اتخاذ قرار بخصوص طلبك.`,
    html: `<p>مرحباً ${escapeHtml(input.ownerName)}،</p><p>تم استلام طلب انضمامك بنجاح وهو الآن قيد مراجعة فريقنا.</p><p><strong>رقم طلبك:</strong> ${escapeHtml(input.referenceId)}</p><p>يمكنك متابعة حالة طلبك في أي وقت عبر: <a href="${statusUrl}">${statusUrl}</a></p><p>سنراسلك فور اتخاذ قرار بخصوص طلبك.</p>`,
  };
}

export function partnerApplicationApprovedEmail(input: { to: string; ownerName: string; setupToken: string }): EmailInput {
  const setupUrl = `${baseUrl()}/partners/setup/${input.setupToken}`;
  return {
    to: input.to,
    subject: "تم قبول طلب انضمامك! أكمل إعداد حسابك",
    text: `مرحباً ${input.ownerName}،\n\nأخبار رائعة — تم قبول طلب انضمامك لمنصة DMS!\n\nأكمل إعداد حسابك (تحديد كلمة مرور) عبر الرابط التالي خلال 7 أيام:\n${setupUrl}\n\nبعد إكمال الإعداد يمكنك تسجيل الدخول مباشرة وبدء استخدام لوحة التحكم.`,
    html: `<p>مرحباً ${escapeHtml(input.ownerName)}،</p><p>أخبار رائعة — تم قبول طلب انضمامك لمنصة DMS!</p><p>أكمل إعداد حسابك (تحديد كلمة مرور) عبر الرابط التالي خلال 7 أيام:</p><p><a href="${setupUrl}">${setupUrl}</a></p><p>بعد إكمال الإعداد يمكنك تسجيل الدخول مباشرة وبدء استخدام لوحة التحكم.</p>`,
  };
}

export function partnerApplicationRejectedEmail(input: { to: string; ownerName: string; reason: string }): EmailInput {
  return {
    to: input.to,
    subject: "بخصوص طلب انضمامك لمنصة DMS",
    text: `مرحباً ${input.ownerName}،\n\nنأسف لإبلاغك بأنه تم رفض طلب انضمامك للسبب التالي:\n${input.reason}\n\nإن كان لديك أي استفسار، يسعدنا تواصلك مع فريق الدعم.`,
    html: `<p>مرحباً ${escapeHtml(input.ownerName)}،</p><p>نأسف لإبلاغك بأنه تم رفض طلب انضمامك للسبب التالي:</p><blockquote>${escapeHtml(input.reason)}</blockquote><p>إن كان لديك أي استفسار، يسعدنا تواصلك مع فريق الدعم.</p>`,
  };
}

export function partnerApplicationNeedsInfoEmail(input: { to: string; ownerName: string; message: string; referenceId: string }): EmailInput {
  const statusUrl = `${baseUrl()}/partners/status`;
  return {
    to: input.to,
    subject: "نحتاج معلومات إضافية بخصوص طلب انضمامك",
    text: `مرحباً ${input.ownerName}،\n\nيحتاج فريقنا معلومات إضافية لإكمال مراجعة طلبك:\n${input.message}\n\nرقم طلبك: ${input.referenceId}\nيرجى التواصل مع فريق الدعم لتزويدنا بها، أو متابعة حالة الطلب عبر: ${statusUrl}`,
    html: `<p>مرحباً ${escapeHtml(input.ownerName)}،</p><p>يحتاج فريقنا معلومات إضافية لإكمال مراجعة طلبك:</p><blockquote>${escapeHtml(input.message)}</blockquote><p><strong>رقم طلبك:</strong> ${escapeHtml(input.referenceId)}</p><p>يرجى التواصل مع فريق الدعم لتزويدنا بها، أو متابعة حالة الطلب عبر: <a href="${statusUrl}">${statusUrl}</a></p>`,
  };
}
