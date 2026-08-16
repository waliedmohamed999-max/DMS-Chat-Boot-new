/**
 * طبقة إرسال بريد إلكتروني بسيطة، بنفس نمط `PAYMENT_PROVIDER="mock"` المعتمد أصلاً في المشروع
 * (lib/billing/payment-provider.ts): بنية جاهزة لمزود حقيقي، لكن بلا مزود SMTP/API فعلي متوفر بعد.
 * EMAIL_PROVIDER="console" (الافتراضي): يطبع محتوى الرسالة بوضوح في سجل الخادم فقط، لاستخدامه في
 * التطوير والاختبار قبل ربط مزود حقيقي (Resend/SendGrid/SMTP) — موثّق كفجوة صريحة في QA_REPORT.md.
 */
export type EmailInput = { to: string; subject: string; text: string; html: string };

export async function sendEmail(input: EmailInput): Promise<void> {
  const provider = process.env.EMAIL_PROVIDER || "console";

  if (provider === "console") {
    console.log(
      `📧 [EMAIL:console] إلى: ${input.to} | الموضوع: ${input.subject}\n${"-".repeat(40)}\n${input.text}\n${"-".repeat(40)}`
    );
    return;
  }

  throw new Error(`EMAIL_PROVIDER="${provider}" غير مدعوم بعد — لا يوجد سوى "console" حالياً (راجع QA_REPORT.md).`);
}
