import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { checkIpRateLimit, clientIp } from "@/lib/rateLimit";
import { timingSafeStringEqual } from "@/lib/crypto";
import { applyPaidRechargeInvoice, moyasarWebhookSecret } from "@/lib/billing/moyasar";

/**
 * إشعار Moyasar عند دفع فاتورة شحن (callback_url). جسم الطلب يُستخدم فقط لمعرفة معرّف الفاتورة — الحالة
 * والمبلغ والحساب تُقرأ من Moyasar نفسها بالمفتاح السري، فإشعار مزوَّر لا يضيف رصيداً. إن ضُبط
 * MOYASAR_WEBHOOK_SECRET يُشترط أيضاً تطابق secret_token (طبقة حماية إضافية).
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!(await checkIpRateLimit(ip, "moyasar-callback", 120, 60)).allowed) return new NextResponse("Rate limit exceeded", { status: 429 });

  const body = await req.json().catch(() => null);
  const secret = await moyasarWebhookSecret();
  if (secret && !(typeof body?.secret_token === "string" && timingSafeStringEqual(body.secret_token, secret))) {
    return new NextResponse("Invalid token", { status: 401 });
  }
  const invoiceId = String(body?.id ?? body?.data?.invoice_id ?? body?.invoice_id ?? "");
  if (!invoiceId) return NextResponse.json({ ok: false, error: "missing invoice id" }, { status: 400 });

  let note: string;
  let tenantId: string | null = null;
  try {
    const result = await applyPaidRechargeInvoice(invoiceId);
    tenantId = "tenantId" in result ? result.tenantId : null;
    if (result.status === "credited") note = `أُضيف ${result.amountSar} ر.س`;
    else if (result.status === "already_credited") note = "مُضافة مسبقاً";
    else if (result.status === "not_paid") note = `غير مدفوعة (${result.invoiceStatus})`;
    else if (result.status === "invalid") note = result.reason;
    else note = "مُضافة مسبقاً";
  } catch (err) {
    note = err instanceof Error ? err.message : "فشل التحقق";
    await superAdminDb.webhookLog.create({ data: { provider: "PAYMENT_GATEWAY", eventType: "wallet_recharge_callback", payloadJson: { invoiceId } as Prisma.InputJsonValue, signatureValid: true, errorMessage: note } });
    return NextResponse.json({ ok: false }, { status: 500 }); // تُعاد المحاولة من Moyasar
  }
  await superAdminDb.webhookLog.create({
    data: { tenantId, provider: "PAYMENT_GATEWAY", eventType: "wallet_recharge_callback", payloadJson: { invoiceId } as Prisma.InputJsonValue, signatureValid: true, processedAt: new Date(), errorMessage: note },
  });
  return NextResponse.json({ ok: true });
}
