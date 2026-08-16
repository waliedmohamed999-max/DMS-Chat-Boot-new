"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/session";
import { withTenant, rawDb } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getPaymentProvider, type MockCardInput } from "@/lib/billing/payment-provider";
import { calculateProration, type ProrationPreview } from "@/lib/billing/proration";
import { checkDowngradeAllowed } from "@/lib/billing/downgradeCheck";
import { getVatRateBps, computeVatAmount } from "@/lib/billing/vat";
import { postInvoicePaymentEntry } from "@/lib/accounting/postings";
import { writeAuditLog } from "@/lib/audit";

const PAUSE_DURATION_DAYS = 30;

export type PlanChangePreview =
  | ({ success: true; blocked: false } & ProrationPreview)
  | { success: true; blocked: true; reasons: string[] }
  | { success: false; error: string };

/** معاينة تغيير الباقة بلا أي تنفيذ فعلي — تُستدعى من نافذة التأكيد قبل الترقية/التخفيض (بند ج). */
export async function previewPlanChange(planId: string): Promise<PlanChangePreview> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.view");
  const tenantId = session.user.tenantId;

  const [subscription, targetPlan] = await Promise.all([
    withTenant(tenantId, (tx) => tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } })),
    rawDb.plan.findUnique({ where: { id: planId } }),
  ]);
  if (!subscription || !targetPlan) return { success: false, error: "بيانات الاشتراك أو الباقة غير موجودة" };

  if (targetPlan.priceMonthlySar < subscription.plan.priceMonthlySar) {
    const blockCheck = await withTenant(tenantId, (tx) => checkDowngradeAllowed(tx, tenantId, targetPlan));
    if (!blockCheck.allowed) return { success: true, blocked: true, reasons: blockCheck.reasons };
  }

  const proration = calculateProration(
    subscription.plan.priceMonthlySar,
    targetPlan.priceMonthlySar,
    subscription.currentPeriodStart,
    subscription.currentPeriodEnd
  );
  return { success: true, blocked: false, ...proration };
}

export type ChangePlanResult = { success: true } | { success: false; error: string };

export async function changePlan(planId: string): Promise<ChangePlanResult> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.manage");
  const tenantId = session.user.tenantId;

  const plan = await rawDb.plan.findUniqueOrThrow({ where: { id: planId } });
  const vatRateBps = await getVatRateBps();

  // معرّف الفاتورة "المدفوعة" (إن وُجدت) يُستخرَج من داخل المعاملة لتسجيل قيد محاسبي بعدها خارجها —
  // Account/JournalEntry جداول عامة على مستوى المنصة (بلا RLS) تُكتَب عبر superAdminDb، وهو اتصال
  // منفصل تماماً عن معاملة withTenant؛ الكتابة داخل نفس المعاملة لن تكون ذرّية فعلياً على أي حال،
  // فالأصح فصلها بعد نجاح الالتزام (Commit) بدل الإيحاء بذرّية غير موجودة فعلياً.
  const result = await withTenant(tenantId, async (tx) => {
    // قفل صفّ الاشتراك قبل القراءة/الكتابة: يمنع تسابقاً حقيقياً لو أرسل التاجر طلبي ترقية
    // متزامنين (نقرة مزدوجة/تبويبان) من إنشاء فاتورتين منفصلتين لنفس التغيير.
    await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "tenantId" = ${tenantId} FOR UPDATE`;

    const subscription = await tx.subscription.findUniqueOrThrow({ where: { tenantId }, include: { plan: true } });

    if (plan.priceMonthlySar < subscription.plan.priceMonthlySar) {
      const blockCheck = await checkDowngradeAllowed(tx, tenantId, plan);
      if (!blockCheck.allowed) return { success: false as const, error: blockCheck.reasons.join(" ") };
    }

    const proration = calculateProration(subscription.plan.priceMonthlySar, plan.priceMonthlySar, subscription.currentPeriodStart, subscription.currentPeriodEnd);
    const vatAmountSar = computeVatAmount(proration.dueNow, vatRateBps);

    let charge: { success: boolean; reference: string; failureReason?: string } = { success: true, reference: "no_charge_due" };
    if (proration.dueNow > 0) {
      charge = await getPaymentProvider().chargeSubscription(tenantId, proration.dueNow);
    }

    if (!charge.success) {
      await tx.invoice.create({
        data: {
          tenantId, amountSar: proration.dueNow, vatRateBps, vatAmountSar, planKey: plan.key,
          status: "FAILED", failureReason: charge.failureReason ?? "فشل التحصيل", periodStart: new Date(), periodEnd: subscription.currentPeriodEnd,
        },
      });
      return { success: false as const, error: "فشل تحصيل المبلغ المستحق — راجع طريقة الدفع." };
    }

    await tx.subscription.update({ where: { tenantId }, data: { planId, status: "ACTIVE", cancelAtPeriodEnd: false } });

    let paidInvoiceId: string | null = null;
    if (proration.dueNow > 0) {
      const invoice = await tx.invoice.create({
        data: {
          tenantId, amountSar: proration.dueNow, vatRateBps, vatAmountSar, planKey: plan.key,
          status: "PAID", periodStart: new Date(), periodEnd: subscription.currentPeriodEnd, paidAt: new Date(),
        },
      });
      paidInvoiceId = invoice.id;
    }

    return { success: true as const, paidInvoiceId, amountSar: proration.dueNow, vatAmountSar, planKey: plan.key };
  });

  if (result.success && result.paidInvoiceId) {
    await postInvoicePaymentEntry({ id: result.paidInvoiceId, amountSar: result.amountSar, vatAmountSar: result.vatAmountSar, planKey: result.planKey }).catch((err) =>
      console.error("❌ فشل تسجيل قيد محاسبي لفاتورة تغيير الباقة:", err)
    );
  }

  await writeAuditLog({
    tenantId, userId: session.user.id,
    action: "subscription.change_plan", targetType: "Subscription", targetId: planId,
    metaJson: { result },
  });

  revalidatePath("/dashboard/billing");
  return { success: result.success, ...(result.success ? {} : { error: result.error }) } as ChangePlanResult;
}

export async function requestCustomPlan(formData: FormData) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.manage");

  const details = String(formData.get("details") ?? "").trim();
  if (!details) throw new Error("صف احتياجك من الباقة المخصصة");

  await withTenant(session.user.tenantId, async (tx) => {
    await tx.approvalRequest.create({
      data: {
        tenantId: session.user.tenantId,
        type: "CUSTOM_PLAN",
        status: "PENDING",
        payloadJson: { details },
      },
    });
  });

  await writeAuditLog({
    tenantId: session.user.tenantId, userId: session.user.id,
    action: "billing.custom_plan_requested", targetType: "ApprovalRequest",
  });

  revalidatePath("/dashboard/billing");
}

// ========================= إلغاء/إيقاف مؤقت للاشتراك (تدفق الاحتفاظ) =========================

export async function cancelSubscriptionAtPeriodEnd(reason: string) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.manage");
  const tenantId = session.user.tenantId;

  await withTenant(tenantId, (tx) =>
    tx.subscription.update({ where: { tenantId }, data: { cancelAtPeriodEnd: true, cancelReason: reason || null } })
  );

  await writeAuditLog({ tenantId, userId: session.user.id, action: "subscription.cancel_scheduled", targetType: "Subscription", metaJson: { reason } });
  revalidatePath("/dashboard/billing");
}

export async function undoCancelSubscription() {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.manage");
  const tenantId = session.user.tenantId;

  await withTenant(tenantId, (tx) => tx.subscription.update({ where: { tenantId }, data: { cancelAtPeriodEnd: false, cancelReason: null } }));

  await writeAuditLog({ tenantId, userId: session.user.id, action: "subscription.cancel_undo", targetType: "Subscription" });
  revalidatePath("/dashboard/billing");
}

/** بديل الإلغاء الكامل المعروض في تدفق الاحتفاظ بالعميل — إيقاف فوري لمدة 30 يوماً، استئناف تلقائي. */
export async function pauseSubscription(reason: string) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.manage");
  const tenantId = session.user.tenantId;

  const pausedUntil = new Date(Date.now() + PAUSE_DURATION_DAYS * 86400000);
  await withTenant(tenantId, (tx) =>
    tx.subscription.update({ where: { tenantId }, data: { status: "PAUSED", pausedUntil, cancelReason: reason || null } })
  );

  await writeAuditLog({ tenantId, userId: session.user.id, action: "subscription.pause", targetType: "Subscription", metaJson: { reason, pausedUntil } });
  revalidatePath("/dashboard/billing");
}

export async function resumeFromPause() {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.manage");
  const tenantId = session.user.tenantId;

  await withTenant(tenantId, (tx) => tx.subscription.update({ where: { tenantId }, data: { status: "ACTIVE", pausedUntil: null } }));

  await writeAuditLog({ tenantId, userId: session.user.id, action: "subscription.resume", targetType: "Subscription" });
  revalidatePath("/dashboard/billing");
}

// ========================= طريقة الدفع (Sandbox — انظر payment-provider.ts) =========================

export type UpdatePaymentMethodResult = { success: true } | { success: false; error: string };

export async function updatePaymentMethod(card: MockCardInput): Promise<UpdatePaymentMethodResult> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.manage");
  const tenantId = session.user.tenantId;

  const tokenized = await getPaymentProvider().tokenizePaymentMethod(card);
  if (!tokenized.success) return { success: false, error: tokenized.error };

  await withTenant(tenantId, (tx) =>
    tx.paymentMethod.upsert({
      where: { tenantId },
      update: { brand: tokenized.brand, last4: tokenized.last4, expiryMonth: tokenized.expiryMonth, expiryYear: tokenized.expiryYear, providerToken: tokenized.providerToken },
      create: { tenantId, brand: tokenized.brand, last4: tokenized.last4, expiryMonth: tokenized.expiryMonth, expiryYear: tokenized.expiryYear, providerToken: tokenized.providerToken },
    })
  );

  await writeAuditLog({ tenantId, userId: session.user.id, action: "billing.payment_method_updated", targetType: "PaymentMethod" });
  revalidatePath("/dashboard/billing");
  return { success: true };
}

export async function retryFailedPayment(invoiceId: string): Promise<ChangePlanResult> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.manage");
  const tenantId = session.user.tenantId;

  const invoice = await withTenant(tenantId, (tx) => tx.invoice.findUnique({ where: { id: invoiceId, tenantId } }));
  if (!invoice || invoice.status !== "FAILED") return { success: false, error: "لا توجد فاتورة فاشلة بهذا المعرّف" };

  const charge = await getPaymentProvider().chargeSubscription(tenantId, invoice.amountSar);

  await withTenant(tenantId, async (tx) => {
    if (charge.success) {
      await tx.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: new Date(), failureReason: null } });
      await tx.subscription.update({ where: { tenantId }, data: { status: "ACTIVE" } });
    } else {
      await tx.invoice.update({ where: { id: invoiceId }, data: { failureReason: charge.failureReason ?? "فشلت إعادة المحاولة" } });
    }
  });

  if (charge.success) {
    await postInvoicePaymentEntry({ id: invoice.id, amountSar: invoice.amountSar, vatAmountSar: invoice.vatAmountSar, planKey: invoice.planKey }).catch((err) =>
      console.error("❌ فشل تسجيل قيد محاسبي لإعادة محاولة الدفع:", err)
    );
  }

  await writeAuditLog({ tenantId, userId: session.user.id, action: "billing.retry_payment", targetType: "Invoice", targetId: invoiceId, metaJson: { success: charge.success } });
  revalidatePath("/dashboard/billing");
  return charge.success ? { success: true } : { success: false, error: "فشلت إعادة محاولة التحصيل مرة أخرى." };
}

/**
 * أداة اختبار فقط (بند 5 في التحقق الذاتي: محاكاة فشل دفع) — تُنشئ فاتورة فاشلة وتنقل الاشتراك
 * لـPAST_DUE يدوياً لاختبار تنبيه فشل الدفع في الواجهة بدون انتظار مزوّد دفع حقيقي.
 * **لماذا لا تتحقق من isSandboxMode()**: ذلك العلم خاص حصراً بتكاملات واتساب/زد/سلة
 * (PlatformSettings.integrationsMode) — مستقل تماماً عن حالة بوابة الدفع. بوابة الدفع نفسها وهمية
 * دائماً حالياً بصرف النظر عن ذلك العلم (getPaymentProvider() يُعيد mockPaymentProvider دون قراءة
 * أي إعداد فعلياً بعد — انظر payment-provider.ts). **يجب حذف هذه الدالة بالكامل عند ربط مزوّد دفع
 * حقيقي فعلياً** — لم تُقيَّد بعلم لأنه لا يوجد علم صحيح يميّز الحالتين حالياً.
 */
export async function devSimulatePaymentFailure() {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "billing.manage");
  const tenantId = session.user.tenantId;

  const subscription = await withTenant(tenantId, (tx) => tx.subscription.findUniqueOrThrow({ where: { tenantId }, include: { plan: true } }));
  const vatRateBps = await getVatRateBps();

  await withTenant(tenantId, async (tx) => {
    await tx.invoice.create({
      data: {
        tenantId, amountSar: subscription.plan.priceMonthlySar, vatRateBps, vatAmountSar: computeVatAmount(subscription.plan.priceMonthlySar, vatRateBps),
        planKey: subscription.plan.key,
        status: "FAILED", failureReason: "محاكاة اختبار: رصيد البطاقة غير كافٍ (Sandbox)",
        periodStart: subscription.currentPeriodStart, periodEnd: subscription.currentPeriodEnd,
      },
    });
    await tx.subscription.update({ where: { tenantId }, data: { status: "PAST_DUE" } });
  });

  revalidatePath("/dashboard/billing");
}
