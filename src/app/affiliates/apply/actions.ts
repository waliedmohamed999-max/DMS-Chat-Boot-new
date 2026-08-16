"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { z } from "zod";
import { rawDb } from "@/lib/db";
import { checkTenantRateLimit } from "@/lib/rateLimit";

const applySchema = z.object({
  name: z.string().min(2, "الاسم قصير جداً"),
  email: z.string().email("بريد إلكتروني غير صالح"),
  phone: z.string().min(8, "رقم هاتف غير صالح"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  promotionPlan: z.string().min(10, "أخبرنا كيف تنوي الترويج للمنصة (10 أحرف على الأقل)"),
  termsAccepted: z.string().optional(),
  formRenderedAt: z.string().optional(),
  website: z.string().optional(), // حقل فخّ (honeypot) — نفس أسلوب partners/apply/actions.ts
});

export type SubmitAffiliateApplicationResult = { success: true; referralCode: string } | { success: false; error: string };

/** أحرف لاتينية/أرقام فقط (يظهر الكود داخل رابط URL: ?ref=CODE) — عشوائي بالكامل، وليس مشتقاً من
 * الاسم، لتفادي أي تسريب معلومة شخصية داخل رابط عام يُنشَر على وسائل التواصل. */
function generateReferralCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export async function submitAffiliateApplication(formData: FormData): Promise<SubmitAffiliateApplicationResult> {
  const parsed = applySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  const data = parsed.data;

  if (data.website && data.website.trim() !== "") {
    return { success: false, error: "تعذّر إرسال الطلب، حاول لاحقاً." };
  }
  const renderedAt = Number(data.formRenderedAt);
  if (!Number.isFinite(renderedAt) || Date.now() - renderedAt < 3000) {
    return { success: false, error: "تعذّر إرسال الطلب، أعد المحاولة." };
  }
  if (data.termsAccepted !== "on") {
    return { success: false, error: "يجب الموافقة على الشروط والأحكام للمتابعة." };
  }

  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = await checkTenantRateLimit(ip, "affiliate-apply", 5, 3600);
  if (!rateLimit.allowed) {
    return { success: false, error: "عدد محاولات كبير جداً من عنوانك الحالي — حاول مرة أخرى بعد ساعة." };
  }

  const email = data.email.toLowerCase().trim();
  const existing = await rawDb.affiliate.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "هذا البريد الإلكتروني مسجَّل بالفعل في برنامج التسويق بالعمولة." };
  }

  let referralCode = generateReferralCode();
  // إعادة محاولة بسيطة عند تصادم نادر (مساحة الكود ~36^8، احتمال التصادم شبه معدوم عملياً).
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await rawDb.affiliate.findUnique({ where: { referralCode } });
    if (!taken) break;
    referralCode = generateReferralCode();
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  await rawDb.affiliate.create({
    data: {
      name: data.name,
      email,
      passwordHash,
      phone: data.phone,
      referralCode,
      promotionPlan: data.promotionPlan,
      status: "PENDING",
    },
  });

  return { success: true, referralCode };
}
