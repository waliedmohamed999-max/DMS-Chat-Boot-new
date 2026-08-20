"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Country } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { getPlatformSettings } from "@/lib/platformSettings";
import { sendEmail } from "@/lib/email/send";
import {
  partnerApplicationApprovedEmail,
  partnerApplicationApprovedReadyEmail,
  partnerApplicationRejectedEmail,
  partnerApplicationNeedsInfoEmail,
} from "@/lib/email/partnerTemplates";
import { getVatRateBps, computeVatAmount } from "@/lib/billing/vat";
import { postInvoicePaymentEntry } from "@/lib/accounting/postings";
import { COUNTRY_TO_CURRENCY } from "@/lib/currency";

async function loadRequest(requestId: string) {
  return superAdminDb.approvalRequest.findUniqueOrThrow({ where: { id: requestId }, include: { tenant: true } });
}

type PartnerApplicationPayload = {
  activityType: string;
  storeName: string;
  ownerName: string;
  phone: string;
  city: string;
  // دولة المتقدّم — تُحدَّد كـTenant.country عند الاعتماد، فتحدد عملة/ضريبة كل فواتيره لاحقاً. طلبات
  // قديمة سابقة لإضافة هذا الحقل لن تحمله — احتياط "SA" في مكان الاستخدام أدناه (تلقائياً السلوك
  // القديم قبل تعدد الدول، بلا أي تغيير سلوك للطلبات الحالية المعلَّقة وقت هذا التحديث).
  country?: Country;
  requestedPlanKey: string;
  requestedPlanName: string;
  termsAcceptedAt: string;
  // هاش كلمة المرور التي حدَّدها المتقدّم بنفسه وقت التقديم (partners/apply) — إن وُجد، يُستخدَم
  // مباشرة كـpasswordHash الحقيقي هنا بدل كلمة مرور عشوائية + رابط إعداد بالبريد. طلبات قديمة قُدِّمت
  // قبل إضافة هذا الحقل لن تحمله — يبقى المسار الاحتياطي (رابط الإعداد) يعمل لها كما كان.
  passwordHash?: string;
  // مسوّق الإحالة (إن وُجد) — قُرئ من كوكي المتقدّم وقت التقديم نفسه (partners/apply/actions.ts)،
  // وليس الآن (متصفح مالك المنصة لا يحمل كوكي إحالة المتقدّم إطلاقاً).
  referralAffiliateId?: string;
};

/**
 * اعتماد طلب انضمام شريك: ينشئ التينانت فعلياً الآن (لم يكن موجوداً وقت التقديم — راجع DECISIONS.md
 * قرار 65)، بحالة TRIAL جاهزة للاستخدام مباشرة (وليس PENDING_REVIEW، لأن المراجعة البشرية تمّت فعلاً
 * عبر الموافقة على هذا الطلب نفسه)، مع باقة المتقدّم المختارة فعلياً وحدودها الصحيحة، ثم يُنشئ رابط
 * إعداد حساب آمناً (رمز عشوائي مُجزَّأ SHA-256، صلاحية 7 أيام) ويرسله بالبريد بدل أي كلمة مرور فورية.
 */
export async function approvePartnerApplication(requestId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.approvals.review");
  const request = await superAdminDb.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });

  if (request.type !== "PARTNER_APPLICATION") throw new Error("نوع طلب غير صالح لهذا الإجراء");
  if (request.status !== "PENDING" && request.status !== "NEEDS_INFO") throw new Error("تم التعامل مع هذا الطلب مسبقاً");
  if (!request.applicantEmail) throw new Error("طلب غير صالح — لا يوجد بريد إلكتروني للمتقدّم");

  const payload = request.payloadJson as PartnerApplicationPayload;
  const plan = await superAdminDb.plan.findUniqueOrThrow({ where: { key: payload.requestedPlanKey } });
  const platformSettings = await getPlatformSettings();

  let slug = slugify(payload.storeName);
  const slugTaken = await superAdminDb.tenant.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  // طلبات حديثة تحمل كلمة مرور حدَّدها المتقدّم بنفسه وقت التقديم — تُستخدَم مباشرة، فلا حاجة لرابط
  // إعداد حساب بالبريد. طلبات قديمة (قبل إضافة هذا الحقل) بلا passwordHash تبقى على المسار الاحتياطي
  // الأصلي: كلمة مرور عشوائية غير قابلة للاستخدام + رابط إعداد آمن (صلاحية 7 أيام).
  const hasOwnPassword = Boolean(payload.passwordHash);
  const rawSetupToken = crypto.randomBytes(32).toString("hex");
  const setupTokenHash = crypto.createHash("sha256").update(rawSetupToken).digest("hex");
  const setupExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const tenantId = await superAdminDb.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { slug, name: payload.storeName, status: "TRIAL", joinSource: "PARTNER_APPLICATION", country: payload.country ?? "SA" } });

    if (payload.referralAffiliateId) {
      await tx.referral.create({ data: { affiliateId: payload.referralAffiliateId, tenantId: tenant.id } });
    }

    const passwordHash = hasOwnPassword ? payload.passwordHash! : await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    const owner = await tx.user.create({
      data: { tenantId: tenant.id, name: payload.ownerName, email: request.applicantEmail!.toLowerCase(), passwordHash, role: "OWNER" },
    });

    await tx.subscription.create({
      data: {
        tenantId: tenant.id, planId: plan.id, status: "TRIALING",
        currentPeriodEnd: new Date(Date.now() + platformSettings.defaultTrialDays * 24 * 3600 * 1000),
      },
    });

    for (const provider of ["META_WHATSAPP", "ZID", "SALLA"] as const) {
      await tx.integration.create({ data: { tenantId: tenant.id, provider, status: "DISCONNECTED", isSandbox: true } });
    }

    if (!hasOwnPassword) {
      await tx.accountSetupToken.create({ data: { userId: owner.id, tokenHash: setupTokenHash, expiresAt: setupExpiresAt } });
    }

    await tx.approvalRequest.update({
      where: { id: requestId },
      data: { tenantId: tenant.id, status: "APPROVED", reviewedByUserId: session.user.id, reviewedAt: new Date() },
    });

    return tenant.id;
  });

  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, action: "platform.partner_application_approve",
      targetType: "Tenant", targetId: tenantId, metaJson: { email: request.applicantEmail, planKey: plan.key },
    },
  });

  if (hasOwnPassword) {
    await sendEmail(partnerApplicationApprovedReadyEmail({ to: request.applicantEmail, ownerName: payload.ownerName }));
  } else {
    await sendEmail(partnerApplicationApprovedEmail({ to: request.applicantEmail, ownerName: payload.ownerName, setupToken: rawSetupToken }));
  }

  revalidatePath("/admin/approvals");
  revalidatePath("/admin/tenants");
}

export async function approveNewTenant(requestId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.approvals.review");
  const request = await loadRequest(requestId);

  await superAdminDb.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: request.tenantId! }, data: { status: "TRIAL", rejectionReason: null } });
    await tx.approvalRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", reviewedByUserId: session.user.id, reviewedAt: new Date() },
    });
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.approval_approve", targetType: "Tenant", targetId: request.tenantId, metaJson: { type: request.type } },
  });

  revalidatePath("/admin/approvals");
  revalidatePath("/admin/tenants");
}

export async function rejectRequest(requestId: string, formData: FormData) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.approvals.review");
  const request = await loadRequest(requestId);
  const rawReason = String(formData.get("reason") ?? "").trim();
  // طلبات الشركاء تصل للمتقدّم مباشرة بالبريد ولا يوجد أي مسار آخر يُطلعه على سبب الرفض — سبب
  // الرفض هنا إلزامي فعلياً وليس مجرد نص افتراضي عام كما في بقية الأنواع.
  if (request.type === "PARTNER_APPLICATION" && !rawReason) {
    throw new Error("سبب الرفض مطلوب لطلبات الشركاء — يصل هذا السبب للمتقدّم مباشرة عبر البريد الإلكتروني.");
  }
  const reason = rawReason || "لم يتم تحديد سبب";

  await superAdminDb.$transaction(async (tx) => {
    await tx.approvalRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED", reviewerNote: reason, reviewedByUserId: session.user.id, reviewedAt: new Date() },
    });

    if (request.type === "NEW_TENANT") {
      await tx.tenant.update({ where: { id: request.tenantId! }, data: { status: "REJECTED", rejectionReason: reason } });
    } else if (request.type === "WHATSAPP_VERIFICATION") {
      await tx.integration.updateMany({
        where: { tenantId: request.tenantId!, provider: "META_WHATSAPP" },
        data: { status: "DISCONNECTED", pendingVerification: false, lastError: reason },
      });
    } else if (request.type === "MESSAGE_TEMPLATE") {
      const payload = request.payloadJson as { templateId?: string } | null;
      if (payload?.templateId) {
        await tx.messageTemplate.update({
          where: { id: payload.templateId },
          data: { status: "REJECTED", rejectionReason: reason },
        });
      }
    }
    // CUSTOM_PLAN: لا إجراء إضافي على الرفض — يبقى التاجر على باقته الحالية
    // PARTNER_APPLICATION: لا تينانت أُنشئ بعد — الإشعار الوحيد هو البريد المُرسَل خارج الـtransaction أدناه
  });

  if (request.type === "PARTNER_APPLICATION" && request.applicantEmail) {
    const payload = request.payloadJson as { ownerName?: string } | null;
    await sendEmail(partnerApplicationRejectedEmail({ to: request.applicantEmail, ownerName: payload?.ownerName ?? "", reason }));
  }

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.approval_reject", targetType: "Tenant", targetId: request.tenantId, metaJson: { type: request.type, reason } },
  });

  revalidatePath("/admin/approvals");
  revalidatePath("/admin/tenants");
}

export async function requestMoreInfo(requestId: string, formData: FormData) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.approvals.review");
  const request = await loadRequest(requestId);
  const message = String(formData.get("message") ?? "").trim();
  if (!message) throw new Error("الرسالة مطلوبة");

  await superAdminDb.approvalRequest.update({
    where: { id: requestId },
    data: { status: "NEEDS_INFO", reviewerNote: message, reviewedByUserId: session.user.id, reviewedAt: new Date() },
  });

  if (request.type === "PARTNER_APPLICATION" && request.applicantEmail) {
    const payload = request.payloadJson as { ownerName?: string } | null;
    await sendEmail(partnerApplicationNeedsInfoEmail({ to: request.applicantEmail, ownerName: payload?.ownerName ?? "", message, referenceId: request.id }));
  }

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.approval_request_info", targetType: "Tenant", targetId: request.tenantId, metaJson: { type: request.type, message } },
  });

  revalidatePath("/admin/approvals");
}

export async function approveWhatsappVerification(requestId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.approvals.review");
  const request = await loadRequest(requestId);

  await superAdminDb.$transaction(async (tx) => {
    await tx.integration.updateMany({
      where: { tenantId: request.tenantId!, provider: "META_WHATSAPP" },
      data: { pendingVerification: false },
    });
    await tx.approvalRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", reviewedByUserId: session.user.id, reviewedAt: new Date() },
    });
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.approval_approve", targetType: "Tenant", targetId: request.tenantId, metaJson: { type: request.type } },
  });

  revalidatePath("/admin/approvals");
}

export async function approveMessageTemplate(requestId: string) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.approvals.review");
  const request = await loadRequest(requestId);
  const payload = request.payloadJson as { templateId?: string } | null;
  if (!payload?.templateId) throw new Error("طلب غير صالح — لا يوجد قالب مرتبط");

  await superAdminDb.$transaction(async (tx) => {
    await tx.messageTemplate.update({ where: { id: payload.templateId }, data: { status: "APPROVED", rejectionReason: null } });
    await tx.approvalRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", reviewedByUserId: session.user.id, reviewedAt: new Date() },
    });
  });

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.approval_approve", targetType: "Tenant", targetId: request.tenantId, metaJson: { type: request.type } },
  });

  revalidatePath("/admin/approvals");
}

export async function approveCustomPlan(requestId: string, formData: FormData) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.approvals.review");
  const request = await loadRequest(requestId);

  const name = String(formData.get("planName") ?? "").trim();
  const priceMonthlySar = parseInt(String(formData.get("price") ?? "0"), 10) || 0;
  const maxUsers = parseInt(String(formData.get("maxUsers") ?? "0"), 10) || 0;
  const maxWhatsappNumbers = parseInt(String(formData.get("maxWhatsappNumbers") ?? "0"), 10) || 0;
  const maxMessagesPerMonth = parseInt(String(formData.get("maxMessagesPerMonth") ?? "0"), 10) || 0;
  if (!name) throw new Error("اسم الباقة مطلوب");

  const tenantId = request.tenantId!;
  // باقة Enterprise مخصصة لتاجر واحد بعينه (isCustomForTenantId) — السعر المُدخَل هنا هو بعملة دولة
  // ذلك التاجر تحديداً (وليس بالضرورة ريالاً سعودياً)، فلا حاجة لحقل pricingJson متعدد الدول هنا
  // كما في الباقات القياسية المشتركة بين كل التجار.
  const tenant = await superAdminDb.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { country: true } });
  const vatRateBps = await getVatRateBps(tenant.country);
  const currency = COUNTRY_TO_CURRENCY[tenant.country];
  const vatAmountSar = computeVatAmount(priceMonthlySar, vatRateBps);
  const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000);

  // فاتورة أول دورة تُنشأ فعلياً هنا — كانت غائبة تماماً سابقاً (اعتماد باقة Enterprise كان ينشئ
  // اشتراكاً بلا أي فاتورة مقابلة، فجوة حقيقية اكتُشفت أثناء تدقيق وحدة الإيرادات).
  const created = await superAdminDb.$transaction(async (tx) => {
    const plan = await tx.plan.create({
      data: {
        key: `custom-${tenantId.slice(0, 8)}-${Date.now()}`,
        name, priceMonthlySar, maxUsers, maxWhatsappNumbers, maxMessagesPerMonth,
        features: ["باقة مخصصة (Enterprise)"],
        isActive: true,
        isCustomForTenantId: tenantId,
      },
    });

    await tx.subscription.upsert({
      where: { tenantId },
      update: { planId: plan.id, status: "ACTIVE" },
      create: { tenantId, planId: plan.id, status: "ACTIVE", currentPeriodEnd: periodEnd },
    });

    await tx.approvalRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", reviewedByUserId: session.user.id, reviewedAt: new Date() },
    });

    const invoice = await tx.invoice.create({
      data: {
        tenantId, amountSar: priceMonthlySar, currency, vatRateBps, vatAmountSar, planKey: plan.key,
        status: "PAID", periodStart: new Date(), periodEnd, paidAt: new Date(),
      },
    });

    return { invoiceId: invoice.id, planKey: plan.key };
  });

  await postInvoicePaymentEntry({ id: created.invoiceId, amountSar: priceMonthlySar, vatAmountSar, planKey: created.planKey, currency }).catch((err) =>
    console.error("❌ فشل تسجيل قيد محاسبي لفاتورة باقة Enterprise:", err)
  );

  await superAdminDb.auditLog.create({
    data: { userId: session.user.id, action: "platform.approval_approve_custom_plan", targetType: "Tenant", targetId: request.tenantId, metaJson: { planName: name, invoiceId: created.invoiceId } },
  });

  revalidatePath("/admin/approvals");
  revalidatePath("/admin/tenants");
}
