import { NextRequest, NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { applyPaidSubscriptionInvoice } from "@/lib/billing/subscriptionCheckout";

/** عودة التاجر من صفحة دفع Moyasar للاشتراك — يُتحقق من الفاتورة لدى Moyasar نفسها ثم يُفعَّل الاشتراك (مرة واحدة). */
export async function GET(req: NextRequest) {
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const to = (status: string) => NextResponse.redirect(`${base}/dashboard/billing?payment=${status}`);
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  const invoiceId = req.nextUrl.searchParams.get("invoice") ?? "";
  if (!/^[a-z0-9]{20,40}$/i.test(invoiceId)) return to("unknown");
  // الفاتورة يجب أن تخص الحساب المسجَّل دخوله — رابط عودة لحساب آخر لا يفعل شيئاً هنا.
  const invoice = await withTenant(tenantId, (tx) => tx.invoice.findUnique({ where: { id: invoiceId, tenantId }, select: { providerInvoiceId: true } }));
  if (!invoice?.providerInvoiceId) return to("unknown");

  try {
    const result = await applyPaidSubscriptionInvoice(invoice.providerInvoiceId, tenantId);
    if (result.status === "applied" || result.status === "already_applied") return to("success");
    if (result.status === "not_paid") return to("pending");
    return to("failed");
  } catch (err) {
    console.error("❌ تحقق دفع الاشتراك عند العودة:", err);
    return to("pending"); // إشعار Moyasar (callback) سيُكمل التفعيل لاحقاً إن كانت مدفوعة فعلاً
  }
}
