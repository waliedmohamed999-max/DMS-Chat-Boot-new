import type { EmailInput } from "@/lib/email/send";
import { baseUrl } from "@/lib/email/partnerTemplates";

// اسم المتجر واسم المالك قادمان من سلة (بيانات خارجية) — يُهرَّبان كبقية القوالب.
function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** تاجر ثبّت تطبيق DMS من سلة ولا يملك حساباً — أُنشئ له حساب ويحدد كلمة مروره من الرابط. */
export function sallaAccountCreatedEmail(input: { to: string; ownerName: string; storeName: string; setupToken: string }): EmailInput {
  const setupUrl = `${baseUrl()}/partners/setup/${input.setupToken}`;
  return {
    to: input.to,
    subject: "تم إنشاء حسابك في DMS Tech لمتجرك على سلة",
    text: `مرحباً ${input.ownerName}،\n\nشكراً لتثبيت تطبيق DMS Tech على متجر "${input.storeName}" في سلة. أنشأنا لك حساباً مرتبطاً بمتجرك، وطلباتك وعملاؤك تُزامَن الآن تلقائياً.\n\nحدِّد كلمة مرور حسابك خلال 7 أيام من الرابط التالي:\n${setupUrl}\n\nحسابك قيد مراجعة سريعة من فريقنا، وسنُعلمك فور تفعيله.`,
    html: `<p>مرحباً ${escapeHtml(input.ownerName)}،</p><p>شكراً لتثبيت تطبيق DMS Tech على متجر "<strong>${escapeHtml(input.storeName)}</strong>" في سلة. أنشأنا لك حساباً مرتبطاً بمتجرك، وطلباتك وعملاؤك تُزامَن الآن تلقائياً.</p><p><a href="${setupUrl}" style="display:inline-block;background:#6d5ef8;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">تحديد كلمة المرور</a></p><p style="font-size:12px;color:#64748b">الرابط صالح لمدة 7 أيام: <span dir="ltr">${setupUrl}</span></p><p>حسابك قيد مراجعة سريعة من فريقنا، وسنُعلمك فور تفعيله.</p>`,
  };
}

/** تاجر لديه حساب DMS بنفس البريد ثبّت التطبيق من سلة — رُبط المتجر بحسابه تلقائياً. */
export function sallaStoreLinkedEmail(input: { to: string; ownerName: string; storeName: string }): EmailInput {
  const url = `${baseUrl()}/dashboard/integrations/salla`;
  return {
    to: input.to,
    subject: "تم ربط متجرك على سلة بحسابك في DMS Tech",
    text: `مرحباً ${input.ownerName}،\n\nتم ربط متجر "${input.storeName}" على سلة بحسابك في DMS Tech تلقائياً لأن البريد الإلكتروني متطابق. الطلبات والعملاء والمنتجات تُزامَن الآن.\n\nتابع حالة الربط من: ${url}\n\nلو لم تثبّت التطبيق بنفسك، احذفه من متجرك على سلة وتواصل معنا فوراً.`,
    html: `<p>مرحباً ${escapeHtml(input.ownerName)}،</p><p>تم ربط متجر "<strong>${escapeHtml(input.storeName)}</strong>" على سلة بحسابك في DMS Tech تلقائياً لأن البريد الإلكتروني متطابق. الطلبات والعملاء والمنتجات تُزامَن الآن.</p><p><a href="${url}">متابعة حالة الربط</a></p><p style="font-size:12px;color:#64748b">لو لم تثبّت التطبيق بنفسك، احذفه من متجرك على سلة وتواصل معنا فوراً.</p>`,
  };
}
