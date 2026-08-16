"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { rawDb } from "@/lib/db";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email/send";
import { getPlatformSettings } from "@/lib/platformSettings";
import { INQUIRY_TYPES } from "./constants";

const contactSchema = z.object({
  name: z.string().min(2, "الاسم قصير جداً"),
  email: z.string().email("بريد إلكتروني غير صالح"),
  phone: z.string().min(8, "رقم هاتف غير صالح"),
  activityType: z.string().min(2, "نوع النشاط مطلوب"),
  inquiryType: z.enum(INQUIRY_TYPES),
  message: z.string().min(5, "الرسالة قصيرة جداً"),
  formRenderedAt: z.string().optional(),
  website: z.string().optional(), // حقل فخّ (honeypot) — نفس نمط partners/apply/actions.ts
});

export type ContactFormResult = { success: true } | { success: false; error: string };

// الحقول هنا مُدخَلة من زائر عام غير موثوق — يجب تهريبها قبل إدراجها في نص HTML لبريد الإشعار،
// وإلا كان بإمكان أي زائر حقن HTML/script داخل جسم البريد الذي يفتحه فريق الدعم (حقن HTML عبر البريد).
function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function submitContactMessage(formData: FormData): Promise<ContactFormResult> {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  const data = parsed.data;

  if (data.website && data.website.trim() !== "") {
    return { success: false, error: "تعذّر إرسال الرسالة، حاول لاحقاً." };
  }
  const renderedAt = Number(data.formRenderedAt);
  if (!Number.isFinite(renderedAt) || Date.now() - renderedAt < 2000) {
    return { success: false, error: "تعذّر إرسال الرسالة، أعد المحاولة." };
  }

  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = await checkTenantRateLimit(ip, "contact-message", 5, 3600);
  if (!rateLimit.allowed) {
    return { success: false, error: "عدد رسائل كبير جداً من عنوانك الحالي — حاول مرة أخرى بعد ساعة." };
  }

  const saved = await rawDb.contactMessage.create({
    data: {
      name: data.name, email: data.email.toLowerCase().trim(), phone: data.phone,
      activityType: data.activityType, inquiryType: data.inquiryType, message: data.message,
    },
  });

  const settings = await getPlatformSettings();
  await sendEmail({
    to: settings.supportEmail,
    subject: `[${data.inquiryType}] رسالة تواصل جديدة من الموقع — ${data.name}`,
    text: `نوع الاستفسار: ${data.inquiryType}\nاسم: ${data.name}\nبريد: ${data.email}\nهاتف: ${data.phone}\nنوع النشاط: ${data.activityType}\n\nالرسالة:\n${data.message}\n\n(معرّف الرسالة: ${saved.id})`,
    html: `<p><strong>نوع الاستفسار:</strong> ${escapeHtml(data.inquiryType)}</p><p><strong>اسم:</strong> ${escapeHtml(data.name)}</p><p><strong>بريد:</strong> ${escapeHtml(data.email)}</p><p><strong>هاتف:</strong> ${escapeHtml(data.phone)}</p><p><strong>نوع النشاط:</strong> ${escapeHtml(data.activityType)}</p><p><strong>الرسالة:</strong><br/>${escapeHtml(data.message)}</p>`,
  });

  return { success: true };
}
