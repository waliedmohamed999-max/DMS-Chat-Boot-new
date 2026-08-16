import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/billing/payment-provider";
import { superAdminDb, withTenant } from "@/lib/db";
import { checkTenantRateLimit } from "@/lib/rateLimit";

/**
 * نقطة استقبال أحداث بوابة الدفع (نجاح/فشل/استرداد) — **الشكل الحالي للـpayload افتراضي/عام**
 * ({ event, tenantId, invoiceId, failureReason }) لأنه لا يوجد مزوّد دفع حقيقي مربوط بعد (Blocker
 * موثَّق في SECURITY_FIXES.md). عند الربط الفعلي بمزوّد حقيقي (Moyasar/PayTabs/Stripe/إلخ)، يجب
 * إعادة كتابة تحليل الـpayload هنا ليطابق الشكل الفعلي الذي يرسله ذلك المزوّد تحديداً — البنية
 * العامة (تحقق توقيع → تسجيل WebhookLog → تحديث حالة الفاتورة/الاشتراك) تبقى كما هي بلا تغيير،
 * بنفس نمط /api/webhooks/zid و/api/webhooks/salla حرفياً.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-payment-signature");
  const signatureValid = getPaymentProvider().verifyWebhookSignature(rawBody, signature);

  const payload = safeParse(rawBody);

  if (!signatureValid) {
    await superAdminDb.webhookLog.create({
      data: { provider: "PAYMENT_GATEWAY", eventType: payload?.event ?? "unknown", payloadJson: payload, signatureValid: false, errorMessage: "Invalid signature" },
    });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const tenantId = payload?.tenantId ? String(payload.tenantId) : null;
  if (!tenantId) {
    await superAdminDb.webhookLog.create({
      data: { provider: "PAYMENT_GATEWAY", eventType: payload?.event ?? "unmatched_account", payloadJson: payload, signatureValid: true, errorMessage: "لا يوجد tenantId في الحدث الوارد" },
    });
    return NextResponse.json({ ok: true });
  }

  const rateLimit = await checkTenantRateLimit(tenantId, "webhook-payment", 300, 60);
  if (!rateLimit.allowed) {
    return new NextResponse("Rate limit exceeded", { status: 429 });
  }

  await withTenant(tenantId, async (tx) => {
    await tx.webhookLog.create({
      data: {
        tenantId, provider: "PAYMENT_GATEWAY", eventType: payload?.event ?? "unknown",
        payloadJson: payload, signatureValid: true, processedAt: new Date(),
      },
    });

    const invoiceId = payload?.invoiceId ? String(payload.invoiceId) : null;

    if (payload?.event === "payment.succeeded") {
      if (invoiceId) await tx.invoice.update({ where: { id: invoiceId, tenantId }, data: { status: "PAID", paidAt: new Date() } });
      // نجاح دفع يعني تعافي الاشتراك من أي حالة متأخر سداد سابقة
      await tx.subscription.update({ where: { tenantId }, data: { status: "ACTIVE" } }).catch(() => {});
    } else if (payload?.event === "payment.failed") {
      const failureReason = payload?.failureReason ? String(payload.failureReason) : "فشل التحصيل من بوابة الدفع";
      if (invoiceId) await tx.invoice.update({ where: { id: invoiceId, tenantId }, data: { status: "FAILED", failureReason } });
      await tx.subscription.update({ where: { tenantId }, data: { status: "PAST_DUE" } }).catch(() => {});
    } else if (payload?.event === "payment.refunded") {
      if (invoiceId) await tx.invoice.update({ where: { id: invoiceId, tenantId }, data: { status: "REFUNDED" } });
    }
  });

  return NextResponse.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}
