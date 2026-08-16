"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { superAdminDb } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platformSettings";
import { slugify } from "@/lib/slug";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { resolveReferralAffiliateId } from "@/lib/affiliates/referralCapture";
import { z } from "zod";

const registerSchema = z.object({
  storeName: z.string().min(2, "اسم المتجر قصير جداً"),
  ownerName: z.string().min(2, "الاسم قصير جداً"),
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  planKey: z.enum(["starter", "growth", "scale"]),
  businessActivity: z.string().min(2, "صف نشاطك التجاري بإيجاز"),
});

export async function registerTenant(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const parsed = registerSchema.safeParse({
    storeName: formData.get("storeName"),
    ownerName: formData.get("ownerName"),
    email: formData.get("email"),
    password: formData.get("password"),
    planKey: formData.get("planKey"),
    businessActivity: formData.get("businessActivity"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  // تسجيل تاجر عام بلا مصادقة مسبقة — بلا هذا الحد كان بالإمكان إغراق مركز الموافقات وقاعدة
  // البيانات بحسابات وهمية بلا أي عائق، خلافاً لبقية النماذج العامة المشابهة (تواصل معنا، طلب شراكة).
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = await checkTenantRateLimit(ip, "register-tenant", 5, 3600);
  if (!rateLimit.allowed) {
    return { error: "عدد محاولات تسجيل كبير جداً من عنوانك الحالي — حاول مرة أخرى بعد ساعة." };
  }

  const existing = await superAdminDb.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (existing) {
    return { error: "هذا البريد الإلكتروني مسجّل مسبقاً" };
  }

  const plan = await superAdminDb.plan.findUniqueOrThrow({ where: { key: parsed.data.planKey } });
  const platformSettings = await getPlatformSettings();

  let slug = slugify(parsed.data.storeName);
  const slugTaken = await superAdminDb.tenant.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  // يُقرأ قبل الـtransaction (كوكي + استعلام بسيط) — لا علاقة له بذرية إنشاء التينانت نفسه.
  const referralAffiliateId = await resolveReferralAffiliateId();

  await superAdminDb.$transaction(async (tx) => {
    // كل تسجيل جديد يدخل بحالة "بانتظار المراجعة" — لا تفعيل تلقائي قبل موافقة مالك المنصة
    // عبر مركز الموافقات (Approvals Center)، تطبيقاً لسياسة المراجعة اليدوية للتجار الجدد.
    const tenant = await tx.tenant.create({
      data: { slug, name: parsed.data.storeName, status: "PENDING_REVIEW", joinSource: "DIRECT_REGISTER" },
    });

    if (referralAffiliateId) {
      await tx.referral.create({ data: { affiliateId: referralAffiliateId, tenantId: tenant.id } });
    }

    await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: parsed.data.ownerName,
        email: parsed.data.email.toLowerCase(),
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
        role: "OWNER",
      },
    });

    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: "TRIALING",
        currentPeriodEnd: new Date(Date.now() + platformSettings.defaultTrialDays * 24 * 3600 * 1000),
      },
    });

    for (const provider of ["META_WHATSAPP", "ZID", "SALLA"] as const) {
      await tx.integration.create({
        data: { tenantId: tenant.id, provider, status: "DISCONNECTED", isSandbox: true },
      });
    }

    await tx.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        type: "NEW_TENANT",
        status: "PENDING",
        payloadJson: { businessActivity: parsed.data.businessActivity, requestedPlanKey: parsed.data.planKey },
      },
    });
  });

  redirect("/login?registered=1");
}
