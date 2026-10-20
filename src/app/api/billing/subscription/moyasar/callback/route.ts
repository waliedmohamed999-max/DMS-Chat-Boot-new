import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { checkIpRateLimit, clientIp } from "@/lib/rateLimit";
import { timingSafeStringEqual } from "@/lib/crypto";
import { applyPaidSubscriptionInvoice } from "@/lib/billing/subscriptionCheckout";
import { moyasarWebhookSecret } from "@/lib/billing/moyasar";

/**
 * إشعار Moyasar عند دفع فاتورة اشتراك (callback_url). الجسم يُستخدم لمعرفة معرّف الفاتورة فقط — الحالة
 * والمبلغ والحساب تُقرأ من Moyasar نفسها بالمفتاح السري، فإشعار مزوَّر لا يفعّل أي اشتراك.
 */
export async function POST(req: NextRequest) {
  if (!(await checkIpRateLimit(clientIp(req.headers), "moyasar-subscription-callback", 120, 60)).allowed) {
    return new NextResponse("Rate limit exceeded", { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const secret = await moyasarWebhookSecret();
  if (secret && !(typeof body?.secret_token === "string" && timingSafeStringEqual(body.secret_token, secret))) {
    return new NextResponse("Invalid token", { status: 401 });
  }
  const providerInvoiceId = String(body?.id ?? body?.data?.invoice_id ?? body?.invoice_id ?? "");
  if (!/^[\w-]{6,80}$/.test(providerInvoiceId)) return NextResponse.json({ ok: false, error: "missing invoice id" }, { status: 400 });

  let note: string;
  let tenantId: string | null = null;
  try {
    const result = await applyPaidSubscriptionInvoice(providerInvoiceId);
    tenantId = "tenantId" in result ? result.tenantId : null;
    if (result.status === "applied") note = "فُعّل الاشتراك";
    else if (result.status === "already_applied") note = "مُطبّقة مسبقاً";
    else if (result.status === "not_paid") note = `غير مدفوعة (${result.invoiceStatus})`;
    else note = "reason" in result ? result.reason : "فاتورة غير صالحة";
  } catch (err) {
    note = err instanceof Error ? err.message : "فشل التحقق";
    await superAdminDb.webhookLog.create({ data: { provider: "PAYMENT_GATEWAY", eventType: "subscription_payment_callback", payloadJson: { providerInvoiceId } as Prisma.InputJsonValue, signatureValid: true, errorMessage: note } });
    return NextResponse.json({ ok: false }, { status: 500 }); // تُعاد المحاولة من Moyasar
  }
  await superAdminDb.webhookLog.create({
    data: { tenantId, provider: "PAYMENT_GATEWAY", eventType: "subscription_payment_callback", payloadJson: { providerInvoiceId } as Prisma.InputJsonValue, signatureValid: true, processedAt: new Date(), errorMessage: note },
  });
  return NextResponse.json({ ok: true });
}
