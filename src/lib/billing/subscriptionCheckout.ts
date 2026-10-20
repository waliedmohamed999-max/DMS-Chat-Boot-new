import { Prisma } from "@prisma/client";
import { rawDb, superAdminDb, withTenant } from "@/lib/db";
import { createMoyasarInvoice, fetchMoyasarInvoice, isMoyasarConfigured } from "@/lib/billing/moyasar";
import { calculateProration } from "@/lib/billing/proration";
import { checkDowngradeAllowed } from "@/lib/billing/downgradeCheck";
import { computeVatAmount, getVatRateBps } from "@/lib/billing/vat";
import { getCountryConfig } from "@/lib/billing/countryConfig";
import { postInvoicePaymentEntry } from "@/lib/accounting/postings";
import { resolvePlanPrice } from "@/lib/planPricing";
import { COUNTRY_TO_CURRENCY } from "@/lib/currency";
import { sendEmail } from "@/lib/email/send";
import { subscriptionReceiptEmail } from "@/lib/email/walletTemplates";

/**
 * دفع الاشتراكات الحقيقي عبر صفحة دفع Moyasar المستضافة (نفس مسار شحن المحفظة المختبَر):
 *  1) تُنشأ فاتورة DMS بحالة PENDING ومعها تفاصيل التغيير المعلّق (checkoutJson)، ثم فاتورة Moyasar مرتبطة بها.
 *  2) التاجر يدفع في صفحة Moyasar (لا تمر بيانات البطاقة على خوادمنا إطلاقاً، ولا تُخزَّن).
 *  3) عند الرجوع أو وصول إشعار Moyasar: نسأل Moyasar مباشرة بالمفتاح السري (paid + نفس المبلغ + نفس الحساب)
 *     ثم نطبّق التغيير مرة واحدة فقط (تحويل ذرّي PENDING → PAID).
 * أنواع الدفع:
 *  - change: ترقية أثناء دورة مدفوعة سارية — يُحصَّل الفرق النسبي فقط وتبقى نهاية الدورة كما هي.
 *  - renew: اشتراك/تجديد لدورة جديدة كاملة (30 يوماً) — للتجربة المجانية والاشتراك المنتهي أو المتأخر.
 *    (بدونه كان "تغيير الباقة" لاشتراك منتهٍ يحسب المستحق صفراً ويفعّل الباقة مجاناً.)
 */

export const PERIOD_DAYS = 30;
export type CheckoutKind = "change" | "renew";
type CheckoutJson = { kind: CheckoutKind; planId: string; periodStart: string; periodEnd: string };

export type CheckoutResult =
  | { ok: true; redirectUrl: string; invoiceId: string }
  | { ok: true; appliedWithoutPayment: true }
  | { ok: false; error: string };

function appUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** هل الاشتراك في دورة مدفوعة سارية (فتُحسب الترقية نسبياً)، أم يحتاج دورة جديدة كاملة؟ */
export function needsNewPeriod(sub: { status: string; currentPeriodEnd: Date }): boolean {
  return sub.status !== "ACTIVE" || sub.currentPeriodEnd.getTime() <= Date.now();
}

/**
 * يجهّز الدفع لتغيير الباقة أو تجديد الاشتراك. التخفيض/تغيير بلا مستحق أثناء دورة سارية يُطبَّق فوراً بلا دفع.
 */
export async function startSubscriptionCheckout(input: { tenantId: string; userId: string; planId: string; forceRenew?: boolean }): Promise<CheckoutResult> {
  const { tenantId, planId } = input;
  const [tenant, plan] = await Promise.all([
    rawDb.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { country: true, name: true } }),
    rawDb.plan.findUnique({ where: { id: planId } }),
  ]);
  if (!plan || !plan.isActive) return { ok: false, error: "الباقة غير متاحة" };
  const currency = COUNTRY_TO_CURRENCY[tenant.country];
  const countryConfig = await getCountryConfig(tenant.country);
  const vatRateBps = await getVatRateBps(tenant.country);
  const targetPrice = resolvePlanPrice(plan, countryConfig);

  const prepared = await withTenant(tenantId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
    const sub = await tx.subscription.findUniqueOrThrow({ where: { tenantId }, include: { plan: true } });
    const currentPrice = resolvePlanPrice(sub.plan, countryConfig);
    const renew = input.forceRenew || needsNewPeriod(sub);

    if (!renew && targetPrice < currentPrice) {
      const block = await checkDowngradeAllowed(tx, tenantId, plan);
      if (!block.allowed) return { error: block.reasons.join(" ") };
    }

    let amount: number;
    let periodStart: Date;
    let periodEnd: Date;
    if (renew) {
      amount = targetPrice;
      periodStart = new Date();
      periodEnd = new Date(Date.now() + PERIOD_DAYS * 24 * 3600 * 1000);
    } else {
      if (sub.planId === planId) return { error: "هذه باقتك الحالية بالفعل" };
      amount = calculateProration(currentPrice, targetPrice, sub.currentPeriodStart, sub.currentPeriodEnd).dueNow;
      periodStart = new Date();
      periodEnd = sub.currentPeriodEnd;
      if (amount <= 0) {
        // تخفيض (أو ترقية بلا فرق) أثناء دورة مدفوعة: يُطبَّق فوراً، والسعر الجديد يسري من الفاتورة القادمة.
        await tx.subscription.update({ where: { tenantId }, data: { planId, cancelAtPeriodEnd: false } });
        return { applied: true as const };
      }
    }
    if (amount <= 0) return { error: "لا يوجد مبلغ مستحق" };

    const checkout: CheckoutJson = { kind: renew ? "renew" : "change", planId, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
    const invoice = await tx.invoice.create({
      data: {
        tenantId, amountSar: amount, currency, vatRateBps, vatAmountSar: computeVatAmount(amount, vatRateBps), planKey: plan.key,
        status: "PENDING", periodStart, periodEnd, checkoutJson: checkout as unknown as Prisma.InputJsonValue,
      },
    });
    return { invoiceId: invoice.id, amount, kind: checkout.kind };
  });

  if ("error" in prepared) return { ok: false, error: prepared.error! };
  if ("applied" in prepared) return { ok: true, appliedWithoutPayment: true };

  const cancelPending = (reason: string) =>
    withTenant(tenantId, (tx) => tx.invoice.update({ where: { id: prepared.invoiceId }, data: { status: "CANCELLED", failureReason: reason } })).catch(() => {});

  if (!(await isMoyasarConfigured())) {
    await cancelPending("بوابة الدفع غير مضبوطة");
    return { ok: false, error: "الدفع الإلكتروني للاشتراكات غير مفعّل بعد — تواصل مع فريق DMS Tech لإتمام الاشتراك." };
  }
  if (currency !== "SAR") {
    await cancelPending("عملة غير مدعومة في بوابة الدفع");
    return { ok: false, error: "الدفع الإلكتروني متاح بالريال السعودي حالياً — تواصل مع فريق DMS Tech لإتمام الاشتراك." };
  }

  try {
    const base = appUrl();
    const moyasar = await createMoyasarInvoice({
      amountHalalas: prepared.amount * 100,
      description: `${prepared.kind === "renew" ? "اشتراك" : "ترقية إلى"} باقة ${plan.name} — DMS Tech (${tenant.name})`.slice(0, 250),
      successUrl: `${base}/api/billing/subscription/moyasar/return?invoice=${prepared.invoiceId}`,
      backUrl: `${base}/dashboard/billing`,
      callbackUrl: `${base}/api/billing/subscription/moyasar/callback`,
      metadata: { purpose: "subscription", tenant_id: tenantId, invoice_id: prepared.invoiceId },
    });
    if (!moyasar.url) throw new Error("لم تُرجع بوابة الدفع رابط الدفع");
    await withTenant(tenantId, (tx) => tx.invoice.update({ where: { id: prepared.invoiceId }, data: { providerInvoiceId: moyasar.id } }));
    // سجل التدقيق لا يُفشل الدفع (فاتورة Moyasar أُنشئت بالفعل والتاجر في طريقه للدفع).
    await superAdminDb.auditLog
      .create({ data: { tenantId, userId: input.userId, action: "billing.subscription_checkout", targetType: "Invoice", targetId: prepared.invoiceId, metaJson: { kind: prepared.kind, planKey: plan.key, amount: prepared.amount } } })
      .catch((err) => console.error("⚠️ تعذّر تسجيل بدء دفع الاشتراك:", err instanceof Error ? err.message : err));
    return { ok: true, redirectUrl: moyasar.url, invoiceId: prepared.invoiceId };
  } catch (err) {
    await cancelPending("تعذّر إنشاء رابط الدفع");
    return { ok: false, error: err instanceof Error ? err.message : "تعذّر إنشاء رابط الدفع" };
  }
}

export type SubscriptionPaymentResult =
  | { status: "applied" | "already_applied"; tenantId: string; invoiceId: string }
  | { status: "not_paid"; invoiceStatus: string }
  | { status: "invalid"; reason: string };

/**
 * يطبّق دفعة اشتراك بعد التحقق منها لدى Moyasar نفسها. آمن للتكرار (الرجوع + إشعار Moyasar معاً يطبّقانها
 * مرة واحدة). expectedTenantId يمنع تطبيق فاتورة على حساب آخر من رابط الرجوع.
 */
export async function applyPaidSubscriptionInvoice(providerInvoiceId: string, expectedTenantId?: string): Promise<SubscriptionPaymentResult> {
  const moyasar = await fetchMoyasarInvoice(providerInvoiceId);
  if (moyasar.metadata?.purpose !== "subscription") return { status: "invalid", reason: "الفاتورة ليست دفع اشتراك" };
  const invoice = await superAdminDb.invoice.findUnique({ where: { providerInvoiceId: moyasar.id } });
  if (!invoice || invoice.id !== moyasar.metadata?.invoice_id || invoice.tenantId !== moyasar.metadata?.tenant_id) return { status: "invalid", reason: "فاتورة غير مطابقة" };
  if (expectedTenantId && invoice.tenantId !== expectedTenantId) return { status: "invalid", reason: "الفاتورة لا تخص هذا الحساب" };
  if (moyasar.currency !== "SAR" || moyasar.amount !== invoice.amountSar * 100) return { status: "invalid", reason: "المبلغ أو العملة لا يطابقان الفاتورة" };
  if (moyasar.status !== "paid") return { status: "not_paid", invoiceStatus: moyasar.status };

  const checkout = invoice.checkoutJson as unknown as CheckoutJson | null;
  if (!checkout?.planId) return { status: "invalid", reason: "تفاصيل الاشتراك مفقودة" };
  const tenantId = invoice.tenantId;

  const applied = await withTenant(tenantId, async (tx) => {
    const claim = await tx.invoice.updateMany({
      where: { id: invoice.id, status: { in: ["PENDING", "CANCELLED", "FAILED", "OVERDUE"] } },
      data: { status: "PAID", paidAt: new Date(), failureReason: null },
    });
    if (claim.count !== 1) return false; // طُبّقت مسبقاً
    if (checkout.kind === "renew") {
      await tx.subscription.update({
        where: { tenantId },
        data: {
          planId: checkout.planId, status: "ACTIVE", cancelAtPeriodEnd: false, cancelReason: null, pausedUntil: null,
          currentPeriodStart: new Date(checkout.periodStart), currentPeriodEnd: new Date(checkout.periodEnd),
          messagesUsedThisPeriod: 0, aiTokensUsedThisPeriod: 0, voiceCallMinutesUsedThisPeriod: 0,
        },
      });
    } else {
      await tx.subscription.update({ where: { tenantId }, data: { planId: checkout.planId, status: "ACTIVE", cancelAtPeriodEnd: false } });
    }
    return true;
  });

  if (applied) {
    await postInvoicePaymentEntry({ id: invoice.id, amountSar: invoice.amountSar, vatAmountSar: invoice.vatAmountSar, planKey: invoice.planKey, currency: invoice.currency }).catch((err) =>
      console.error("❌ فشل تسجيل قيد محاسبي لدفع الاشتراك:", err)
    );
    // الفوترة الإلكترونية (ZATCA): إبلاغ/اعتماد الفاتورة بالخلفية (يتخطى إن لم تُفعَّل وحدة الإصدار).
    void import("@/lib/zatca/service").then((m) => m.processZatcaQueue()).catch((err) => console.error("⚠️ طابور ZATCA:", err instanceof Error ? err.message : err));
    await superAdminDb.auditLog.create({
      data: { tenantId, action: "billing.subscription_paid", targetType: "Invoice", targetId: invoice.id, metaJson: { kind: checkout.kind, provider: "moyasar", providerInvoiceId: moyasar.id } },
    });
    const [owner, plan] = await Promise.all([
      superAdminDb.user.findFirst({ where: { tenantId, role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" } }),
      superAdminDb.plan.findUnique({ where: { id: checkout.planId } }),
    ]);
    if (owner) {
      await sendEmail(subscriptionReceiptEmail({
        to: owner.email, name: owner.name, planName: plan?.name ?? invoice.planKey ?? "", amount: invoice.amountSar,
        periodEnd: new Date(checkout.periodEnd), invoiceNumber: invoice.invoiceNumber, reference: moyasar.id,
      })).catch((err) => console.error("subscription receipt email failed:", err));
    }
  }
  return { status: applied ? "applied" : "already_applied", tenantId, invoiceId: invoice.id };
}

/**
 * تذكير بالتجديد قبل 3 أيام من نهاية الدورة (مرة واحدة لكل دورة — مفتاح Redis بنهاية الدورة). يستثني
 * الاشتراكات المدارة عبر سلة/زد والمجدولة للإلغاء.
 */
export async function sendRenewalReminders(): Promise<number> {
  const { redisConnection } = await import("@/lib/queue/connection");
  const { getMarketplaceBilling } = await import("@/lib/integrations/marketplaceBilling");
  const now = Date.now();
  const due = await superAdminDb.subscription.findMany({
    where: { status: "ACTIVE", cancelAtPeriodEnd: false, currentPeriodEnd: { gt: new Date(now), lt: new Date(now + 3 * 24 * 3600 * 1000) } },
    include: { plan: { select: { name: true } } },
    take: 500,
  });
  let sent = 0;
  for (const sub of due) {
    if (await getMarketplaceBilling(sub.tenantId)) continue;
    const key = `renewal-reminder:${sub.tenantId}:${sub.currentPeriodEnd.toISOString().slice(0, 10)}`;
    if ((await redisConnection.set(key, "1", "EX", 10 * 24 * 3600, "NX")) !== "OK") continue;
    const owner = await superAdminDb.user.findFirst({ where: { tenantId: sub.tenantId, role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" } });
    if (!owner) continue;
    const { subscriptionRenewalReminderEmail } = await import("@/lib/email/walletTemplates");
    await sendEmail(subscriptionRenewalReminderEmail({ to: owner.email, name: owner.name, planName: sub.plan.name, periodEnd: sub.currentPeriodEnd })).catch((err) =>
      console.error("renewal reminder email failed:", err)
    );
    sent++;
  }
  return sent;
}
