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
