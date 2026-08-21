import type { EmailInput } from "@/lib/email/send";
import { baseUrl } from "@/lib/email/partnerTemplates";

// name مُدخَل من المسوّق نفسه وقت التقديم (affiliates/apply) — يجب تهريبه قبل إدراجه في HTML بريد
// فعلي، نفس القيد الموثَّق في partnerTemplates.ts::escapeHtml بالضبط.
function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** يُرسَل من commissionSync.ts::promotePendingToApproved — بريد واحد مجمّع لكل مسوّق (وليس بريداً
 * منفصلاً لكل عمولة تحوّلت في نفس دورة المصالحة). */
export function commissionApprovedEmail(input: { to: string; name: string; amountSar: number; totalApprovedSar: number }): EmailInput {
  const dashboardUrl = `${baseUrl()}/affiliates/dashboard`;
  return {
    to: input.to,
    subject: "عمولة جديدة جاهزة للصرف — منصة DMS",
    text: `مرحباً ${input.name}،\n\nعمولة جديدة بقيمة ${input.amountSar.toLocaleString("ar-SA")} ر.س بقت جاهزة للصرف بعد فترة الحجز (Net 30).\n\nرصيدك المتاح للصرف الآن: ${input.totalApprovedSar.toLocaleString("ar-SA")} ر.س\n\nتقدر تطلب الصرف من لوحتك: ${dashboardUrl}`,
    html: `<p>مرحباً ${escapeHtml(input.name)}،</p><p>عمولة جديدة بقيمة <strong>${input.amountSar.toLocaleString("ar-SA")} ر.س</strong> بقت جاهزة للصرف بعد فترة الحجز (Net 30).</p><p>رصيدك المتاح للصرف الآن: <strong>${input.totalApprovedSar.toLocaleString("ar-SA")} ر.س</strong></p><p>تقدر تطلب الصرف من لوحتك: <a href="${dashboardUrl}">${dashboardUrl}</a></p>`,
  };
}

/** يُرسَل من admin/affiliates/actions.ts::markPayoutPaid بعد نجاح تحديد الصرف كمكتمل فعلياً. */
export function payoutPaidEmail(input: { to: string; name: string; amountSar: number; reference: string | null }): EmailInput {
  const referenceText = input.reference ? `\nمرجع التحويل: ${input.reference}` : "";
  const referenceHtml = input.reference ? `<p>مرجع التحويل: ${escapeHtml(input.reference)}</p>` : "";
  return {
    to: input.to,
    subject: "تم تحويل عمولتك — منصة DMS",
    text: `مرحباً ${input.name}،\n\nتم تحويل ${input.amountSar.toLocaleString("ar-SA")} ر.س لحسابك بنجاح.${referenceText}\n\nشكراً لك على شراكتك معنا!`,
    html: `<p>مرحباً ${escapeHtml(input.name)}،</p><p>تم تحويل <strong>${input.amountSar.toLocaleString("ar-SA")} ر.س</strong> لحسابك بنجاح.</p>${referenceHtml}<p>شكراً لك على شراكتك معنا!</p>`,
  };
}
