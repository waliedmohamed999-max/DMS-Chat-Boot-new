"use server";

import { headers } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { superAdminDb, rawDb } from "@/lib/db";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email/send";
import { partnerApplicationReceivedEmail } from "@/lib/email/partnerTemplates";
import { resolveReferralAffiliateId } from "@/lib/affiliates/referralCapture";

const applySchema = z.object({
  activityType: z.string().min(2, "اختر نوع النشاط"),
  storeName: z.string().min(2, "اسم النشاط قصير جداً"),
  ownerName: z.string().min(2, "الاسم قصير جداً"),
  email: z.string().email("بريد إلكتروني غير صالح"),
  phone: z.string().min(8, "رقم هاتف غير صالح"),
  city: z.string().min(2, "المدينة مطلوبة"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  planKey: z.string().min(1, "اختر باقة"),
  termsAccepted: z.string().optional(),
  formRenderedAt: z.string().optional(),
  website: z.string().optional(), // حقل فخّ (honeypot) — يجب أن يبقى فارغاً دائماً من مستخدم حقيقي
});

export type SubmitApplicationResult = { success: true; referenceId: string } | { success: false; error: string };

/** يجلب الباقات القياسية الفعّالة الحقيقية فقط (وليس الباقات المخصصة لتاجر بعينه) — نفس البيانات المعروضة لفريق المنصة. */
export async function getPublicPlans() {
  return rawDb.plan.findMany({
    where: { isActive: true, isCustomForTenantId: null },
    orderBy: { priceMonthlySar: "asc" },
    select: { key: true, name: true, priceMonthlySar: true, maxUsers: true, maxWhatsappNumbers: true, maxMessagesPerMonth: true, features: true, isPopular: true, annualDiscountBps: true },
  });
}

export async function submitPartnerApplication(formData: FormData): Promise<SubmitApplicationResult> {
  const parsed = applySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  const data = parsed.data;

  // حقل الفخّ (honeypot): مخفي بصرياً عن المستخدم الحقيقي عبر CSS في الواجهة — أي بوت حشو نماذج آلي
  // يملأ كل الحقول عادة فيملأ هذا أيضاً. رسالة رفض عامة عمداً بدل كشف سبب الرفض الفعلي للبوت.
  if (data.website && data.website.trim() !== "") {
    return { success: false, error: "تعذّر إرسال الطلب، حاول لاحقاً." };
  }

  // حماية إضافية خفيفة من الإرسال الآلي: نموذج بشري حقيقي لا يُملأ ويُرسَل خلال أقل من 3 ثوانٍ من عرضه.
  const renderedAt = Number(data.formRenderedAt);
  if (!Number.isFinite(renderedAt) || Date.now() - renderedAt < 3000) {
    return { success: false, error: "تعذّر إرسال الطلب، أعد المحاولة." };
  }

  if (data.termsAccepted !== "on") {
    return { success: false, error: "يجب الموافقة على الشروط والأحكام للمتابعة." };
  }

  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = await checkTenantRateLimit(ip, "partner-apply", 5, 3600);
  if (!rateLimit.allowed) {
    return { success: false, error: "عدد محاولات كبير جداً من عنوانك الحالي — حاول مرة أخرى بعد ساعة." };
  }

  const email = data.email.toLowerCase().trim();

  const existingUser = await superAdminDb.user.findUnique({ where: { email } });
  if (existingUser) {
    return { success: false, error: "هذا البريد الإلكتروني مسجَّل مسبقاً على المنصة — سجّل الدخول مباشرة." };
  }

  const existingPending = await superAdminDb.approvalRequest.findFirst({
    where: { type: "PARTNER_APPLICATION", applicantEmail: email, status: { in: ["PENDING", "NEEDS_INFO"] } },
  });
  if (existingPending) {
    return {
      success: false,
      error: `لديك طلب انضمام قيد المراجعة بالفعل بنفس البريد الإلكتروني (رقم الطلب: ${existingPending.id}). يمكنك متابعة حالته من صفحة "تتبع الطلب".`,
    };
  }

  const plan = await superAdminDb.plan.findFirst({ where: { key: data.planKey, isActive: true, isCustomForTenantId: null } });
  if (!plan) {
    return { success: false, error: "الباقة المختارة لم تعد متاحة، يرجى اختيار باقة أخرى." };
  }

  // يُقرأ الآن (جلسة/كوكي المتقدّم نفسه) لا وقت الموافقة لاحقاً (متصفح مالك المنصة، بلا كوكي إحالة
  // إطلاقاً) — يُخزَّن في payloadJson ليُستخدَم عند إنشاء التينانت الفعلي في approvePartnerApplication.
  const referralAffiliateId = await resolveReferralAffiliateId();

  // كلمة المرور تُجزَّأ (bcrypt) فوراً هنا ولا تُخزَّن أبداً بنصها الخام في أي مكان (لا في payloadJson
  // ولا في سجل التدقيق ولا في بريد التأكيد) — نفس معيار تخزين User.passwordHash نفسه. يُستخدَم الهاش
  // مباشرة كـpasswordHash الحقيقي للحساب عند إنشائه فعلياً في approvePartnerApplication، بدل كلمة
  // مرور عشوائية غير قابلة للاستخدام ورابط إعداد حساب منفصل بالبريد (كان يتطلب خطوة إضافية للتاجر).
  const passwordHash = await bcrypt.hash(data.password, 10);

  const request = await superAdminDb.approvalRequest.create({
    data: {
      type: "PARTNER_APPLICATION",
      status: "PENDING",
      applicantEmail: email,
      payloadJson: {
        activityType: data.activityType,
        storeName: data.storeName,
        ownerName: data.ownerName,
        phone: data.phone,
        city: data.city,
        passwordHash,
        requestedPlanKey: plan.key,
        requestedPlanName: plan.name,
        termsAcceptedAt: new Date().toISOString(),
        ...(referralAffiliateId ? { referralAffiliateId } : {}),
      },
    },
  });

  await superAdminDb.auditLog.create({
    data: {
      action: "partner.application_submitted",
      targetType: "ApprovalRequest",
      targetId: request.id,
      metaJson: { email, storeName: data.storeName, planKey: plan.key },
    },
  });

  await sendEmail(partnerApplicationReceivedEmail({ to: email, ownerName: data.ownerName, referenceId: request.id }));

  return { success: true, referenceId: request.id };
}
