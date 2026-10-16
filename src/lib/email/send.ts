import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/**
 * طبقة إرسال بريد إلكتروني، بنفس نمط `PAYMENT_PROVIDER` المعتمد أصلاً في المشروع
 * (lib/billing/payment-provider.ts):
 * - EMAIL_PROVIDER="console" (الافتراضي): يطبع محتوى الرسالة في سجل الخادم فقط — للتطوير والاختبار.
 * - EMAIL_PROVIDER="smtp": إرسال فعلي عبر أي خادم SMTP (بريد Hostinger، Gmail، Resend، Amazon SES،
 *   إلخ) بالمتغيرات: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM. المنفذ 465 = اتصال
 *   مشفَّر مباشر (SMTPS)، أي منفذ آخر (587 عادةً) = STARTTLS.
 */
export type EmailInput = { to: string; subject: string; text: string; html: string };

declare global {
  // eslint-disable-next-line no-var
  var __smtpTransporter: Transporter | undefined;
}

function smtpTransporter(): Transporter {
  if (global.__smtpTransporter) return global.__smtpTransporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error('EMAIL_PROVIDER="smtp" يتطلب ضبط SMTP_HOST وSMTP_USER وSMTP_PASS.');
  }
  const port = Number(process.env.SMTP_PORT || 465);

  global.__smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    // مهلات قصيرة صريحة: خادم SMTP بطيء/غير متاح لا يجب أن يعلّق طلب المستخدم (دعوة، موافقة، استعادة كلمة مرور) دقائق.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return global.__smtpTransporter;
}

export async function sendEmail(input: EmailInput): Promise<void> {
  const provider = process.env.EMAIL_PROVIDER || "console";

  if (provider === "console") {
    console.log(
      `📧 [EMAIL:console] إلى: ${input.to} | الموضوع: ${input.subject}\n${"-".repeat(40)}\n${input.text}\n${"-".repeat(40)}`
    );
    return;
  }

  if (provider === "smtp") {
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
    await smtpTransporter().sendMail({ from, to: input.to, subject: input.subject, text: input.text, html: wrapHtml(input.html) });
    return;
  }

  throw new Error(`EMAIL_PROVIDER="${provider}" غير مدعوم — القيم المتاحة: "console" أو "smtp".`);
}

/** غلاف RTL موحّد لكل القوالب — القوالب نفسها تُرجع فقرات HTML بسيطة بلا اتجاه نص صريح. */
function wrapHtml(body: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;padding:24px;background:#f5f7fb;font-family:Tahoma,Arial,sans-serif;color:#0f172a;line-height:1.8"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;direction:rtl;text-align:right">${body}<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px"><p style="font-size:12px;color:#64748b;margin:0">DMS — Digital Messaging System</p></div></body></html>`;
}
