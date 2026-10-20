import crypto from "crypto";
import nodemailer from "nodemailer";
import { getPlatformSecrets } from "@/lib/platformSecrets";
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
  var __smtpTransporter: { key: string; transporter: Transporter } | undefined;
}

type MailConfig = { provider: string; host: string | null; port: number; user: string | null; pass: string | null; from: string | null };

/** إعدادات البريد من لوحة الأدمن (جاهزية الربط) ثم متغيرات البيئة — lib/platformSecrets.ts. */
async function mailConfig(): Promise<MailConfig> {
  const s = await getPlatformSecrets();
  return {
    provider: s.EMAIL_PROVIDER || "console",
    host: s.SMTP_HOST, port: Number(s.SMTP_PORT || 465), user: s.SMTP_USER, pass: s.SMTP_PASS, from: s.EMAIL_FROM,
  };
}

/** ناقل SMTP مُعاد الاستخدام — يُعاد إنشاؤه تلقائياً إن تغيّرت الإعدادات من اللوحة. */
function smtpTransporter(c: MailConfig): Transporter {
  if (!c.host || !c.user || !c.pass) {
    throw new Error("البريد عبر SMTP يتطلب الخادم واسم المستخدم وكلمة المرور (لوحة الأدمن ← جاهزية الربط).");
  }
  const key = crypto.createHash("sha256").update([c.host, c.port, c.user, c.pass].join("|")).digest("hex");
  if (global.__smtpTransporter?.key === key) return global.__smtpTransporter.transporter;
  const transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    auth: { user: c.user, pass: c.pass },
    // مهلات قصيرة صريحة: خادم SMTP بطيء/غير متاح لا يجب أن يعلّق طلب المستخدم (دعوة، موافقة، استعادة كلمة مرور) دقائق.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  global.__smtpTransporter = { key, transporter };
  return transporter;
}

export async function sendEmail(input: EmailInput): Promise<void> {
  const c = await mailConfig();

  if (c.provider === "console") {
    console.log(
      `📧 [EMAIL:console] إلى: ${input.to} | الموضوع: ${input.subject}
${"-".repeat(40)}
${input.text}
${"-".repeat(40)}`
    );
    return;
  }

  if (c.provider === "smtp") {
    const from = c.from || c.user || undefined;
    await smtpTransporter(c).sendMail({ from, to: input.to, subject: input.subject, text: input.text, html: wrapHtml(input.html) });
    return;
  }

  throw new Error(`مزوّد البريد "${c.provider}" غير مدعوم — القيم المتاحة: "console" أو "smtp".`);
}

/**
 * تشخيص إعدادات البريد لمالك المنصة (زر "إرسال بريد تجريبي" في admin/settings): يتحقق من الاتصال
 * وتسجيل الدخول لخادم SMTP ثم يرسل رسالة فعلية، ويعيد رد الخادم نفسه (رمز الخطأ ونصه) بدل رسالة
 * عامة — بلا كشف كلمة المرور. بدونه لا طريقة لمعرفة سبب فشل الإرسال إلا من سجلات الخادم.
 */
export async function diagnoseEmail(to: string): Promise<{ ok: boolean; detail: string }> {
  const c = await mailConfig();
  const target = `${c.user ?? "(بلا مستخدم)"} @ ${c.host ?? "(بلا خادم)"}:${c.port}`;
  if (c.provider !== "smtp") {
    return { ok: false, detail: `مزوّد البريد "${c.provider}" — الرسائل تُطبع في سجل الخادم فقط ولا تُرسل. اختر SMTP من جاهزية الربط.` };
  }
  try {
    await smtpTransporter(c).verify();
  } catch (err) {
    global.__smtpTransporter = undefined;
    return { ok: false, detail: `فشل الاتصال/تسجيل الدخول (${target}): ${describeSmtpError(err)}` };
  }
  try {
    await sendEmail({ to, subject: "بريد تجريبي — DMS Tech", text: "إعدادات البريد سليمة: هذه رسالة تجريبية من لوحة مالك المنصة.", html: "<p>إعدادات البريد سليمة: هذه رسالة تجريبية من لوحة مالك المنصة.</p>" });
    return { ok: true, detail: `تم الإرسال إلى ${to} عبر ${target}` };
  } catch (err) {
    return { ok: false, detail: `تم تسجيل الدخول لكن فشل الإرسال (${target}): ${describeSmtpError(err)}` };
  }
}

function describeSmtpError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string };
  return [e.code, e.responseCode, e.response ?? e.message].filter(Boolean).join(" — ");
}

/** غلاف RTL موحّد لكل القوالب — القوالب نفسها تُرجع فقرات HTML بسيطة بلا اتجاه نص صريح. */
function wrapHtml(body: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;padding:24px;background:#f5f7fb;font-family:Tahoma,Arial,sans-serif;color:#0f172a;line-height:1.8"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;direction:rtl;text-align:right">${body}<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px"><p style="font-size:12px;color:#64748b;margin:0">DMS Tech</p></div></body></html>`;
}
