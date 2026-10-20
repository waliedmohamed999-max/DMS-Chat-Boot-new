import type { EmailInput } from "@/lib/email/send";
import { baseUrl } from "@/lib/email/partnerTemplates";

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** رصيد محفظة الرسائل هبط تحت عتبة التنبيه — يُرسل مرة واحدة لكل هبوط (lib/billing/wallet.ts). */
export function walletLowBalanceEmail(input: { to: string; name: string; balance: number; threshold: number }): EmailInput {
  const url = `${baseUrl()}/dashboard/billing`;
  const balance = input.balance.toFixed(2);
  const threshold = input.threshold.toFixed(2);
  return {
    to: input.to,
    subject: `رصيد محفظة رسائل واتساب منخفض (${balance} ر.س)`,
    text: `مرحباً ${input.name}،\n\nرصيد محفظة رسائل واتساب في DMS Tech أصبح ${balance} ر.س، أقل من حد التنبيه (${threshold} ر.س). عند نفاد الرصيد تتوقف رسائل الحملات والقوالب تلقائياً.\n\nاشحن المحفظة من: ${url}`,
    html: `<p>مرحباً ${escapeHtml(input.name)}،</p><p>رصيد محفظة رسائل واتساب في DMS Tech أصبح <strong>${balance} ر.س</strong>، أقل من حد التنبيه (${threshold} ر.س). عند نفاد الرصيد تتوقف رسائل الحملات والقوالب تلقائياً.</p><p><a href="${url}" style="display:inline-block;background:#6d5ef8;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">شحن المحفظة</a></p>`,
  };
}

/** إيصال شحن محفظة ناجح عبر بوابة الدفع. */
export function walletRechargeReceiptEmail(input: { to: string; name: string; amount: number; balance: number; reference: string }): EmailInput {
  const url = `${baseUrl()}/dashboard/billing/wallet`;
  return {
    to: input.to,
    subject: `تم شحن محفظة رسائل واتساب بـ ${input.amount.toFixed(2)} ر.س`,
    text: `مرحباً ${input.name}،\n\nتم شحن محفظة رسائل واتساب في DMS Tech بمبلغ ${input.amount.toFixed(2)} ر.س. الرصيد الحالي: ${input.balance.toFixed(2)} ر.س.\nمرجع الدفع: ${input.reference}\n\nسجل الحركات: ${url}`,
    html: `<p>مرحباً ${escapeHtml(input.name)}،</p><p>تم شحن محفظة رسائل واتساب في DMS Tech بمبلغ <strong>${input.amount.toFixed(2)} ر.س</strong>. الرصيد الحالي: <strong>${input.balance.toFixed(2)} ر.س</strong>.</p><p style="font-size:12px;color:#64748b">مرجع الدفع: <span dir="ltr">${escapeHtml(input.reference)}</span></p><p><a href="${url}">سجل الحركات</a></p>`,
  };
}

/** دعوة تاجر على ربط Meta المباشر (القديم) لنقل رقمه إلى واتساب الرسمي عبر DMS (360dialog). */
export function migrationInviteEmail(input: { to: string; name: string }): EmailInput {
  const url = `${baseUrl()}/dashboard/integrations`;
  return {
    to: input.to,
    subject: "انقل رقم واتساب متجرك إلى واتساب الرسمي عبر DMS Tech",
    text: `مرحباً ${input.name}،\n\nنقلنا ربط واتساب في DMS Tech إلى شريك واتساب الرسمي 360dialog: لا حاجة لبطاقة دفع في Meta، والرسائل تُدفع من محفظة مسبقة الدفع داخل لوحتك بسعر واضح لكل رسالة.\n\nنفس رقمك ونفس محادثاتك وقوالبك — النقل يتم بخطوات قليلة من صفحة التكاملات، ويبقى ربطك الحالي يعمل حتى تكتمل.\n\nابدأ من: ${url}`,
    html: `<p>مرحباً ${escapeHtml(input.name)}،</p><p>نقلنا ربط واتساب في DMS Tech إلى شريك واتساب الرسمي <strong>360dialog</strong>: لا حاجة لبطاقة دفع في Meta، والرسائل تُدفع من <strong>محفظة مسبقة الدفع</strong> داخل لوحتك بسعر واضح لكل رسالة.</p><p>نفس رقمك ونفس محادثاتك وقوالبك — النقل يتم بخطوات قليلة من صفحة التكاملات، ويبقى ربطك الحالي يعمل حتى تكتمل.</p><p><a href="${url}" style="display:inline-block;background:#6d5ef8;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">ابدأ النقل</a></p>`,
  };
}

/** إيصال دفع اشتراك عبر بوابة الدفع (اشتراك جديد/تجديد/ترقية). */
export function subscriptionReceiptEmail(input: { to: string; name: string; planName: string; amount: number; periodEnd: Date; invoiceNumber: number; reference: string }): EmailInput {
  const url = `${baseUrl()}/dashboard/billing`;
  const until = input.periodEnd.toLocaleDateString("ar-SA");
  return {
    to: input.to,
    subject: `تم دفع اشتراك DMS Tech — باقة ${input.planName}`,
    text: `مرحباً ${input.name}،\n\nاستلمنا دفعة اشتراكك في باقة ${input.planName} بمبلغ ${input.amount} ر.س (شامل الضريبة). اشتراكك فعّال حتى ${until}.\nرقم الفاتورة: ${input.invoiceNumber} — مرجع الدفع: ${input.reference}\n\nالفاتورة الضريبية متاحة من: ${url}`,
    html: `<p>مرحباً ${escapeHtml(input.name)}،</p><p>استلمنا دفعة اشتراكك في باقة <strong>${escapeHtml(input.planName)}</strong> بمبلغ <strong>${input.amount} ر.س</strong> (شامل الضريبة). اشتراكك فعّال حتى <strong>${until}</strong>.</p><p style="font-size:12px;color:#64748b">رقم الفاتورة: ${input.invoiceNumber} — مرجع الدفع: <span dir="ltr">${escapeHtml(input.reference)}</span></p><p><a href="${url}">الفاتورة الضريبية والفوترة</a></p>`,
  };
}

/** تذكير قبل انتهاء الاشتراك بأيام — لا تحصيل تلقائي من بطاقات محفوظة، فالتجديد بضغطة من صفحة الفوترة. */
export function subscriptionRenewalReminderEmail(input: { to: string; name: string; planName: string; periodEnd: Date }): EmailInput {
  const url = `${baseUrl()}/dashboard/billing`;
  const until = input.periodEnd.toLocaleDateString("ar-SA");
  return {
    to: input.to,
    subject: `اشتراكك في DMS Tech ينتهي ${until} — جدّده الآن`,
    text: `مرحباً ${input.name}،\n\nاشتراكك في باقة ${input.planName} ينتهي بتاريخ ${until}. جدّده قبلها لضمان استمرار الحملات والرسائل التلقائية بلا انقطاع.\n\nالتجديد من: ${url}`,
    html: `<p>مرحباً ${escapeHtml(input.name)}،</p><p>اشتراكك في باقة <strong>${escapeHtml(input.planName)}</strong> ينتهي بتاريخ <strong>${until}</strong>. جدّده قبلها لضمان استمرار الحملات والرسائل التلقائية بلا انقطاع.</p><p><a href="${url}" style="display:inline-block;background:#6d5ef8;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">جدّد الاشتراك</a></p>`,
  };
}
