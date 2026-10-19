import { NextRequest, NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/session";
import { redisConnection } from "@/lib/queue/connection";
import { applyPaidRechargeInvoice } from "@/lib/billing/moyasar";

/** عودة التاجر من صفحة دفع Moyasar — يُتحقق من الفاتورة لدى Moyasar نفسها ثم يُضاف الرصيد (مرة واحدة). */
export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const to = (status: string) => NextResponse.redirect(`${base}/dashboard/billing/wallet?recharge=${status}`);
  const session = await requireTenantSession();

  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  const stored = /^[a-f0-9]{32}$/.test(ref) ? await redisConnection.get(`wallet-recharge:${ref}`) : null;
  if (!stored) return to("unknown");
  const { tenantId, invoiceId } = JSON.parse(stored) as { tenantId: string; invoiceId: string };
  if (tenantId !== session.user.tenantId) return to("unknown");

  try {
    const result = await applyPaidRechargeInvoice(invoiceId, tenantId);
    if (result.status === "credited" || result.status === "already_credited") return to("success");
    if (result.status === "not_paid") return to("pending");
    return to("failed");
  } catch (err) {
    console.error("❌ تحقق شحن المحفظة عند العودة:", err);
    return to("pending"); // إشعار Moyasar (callback) سيُكمل الإضافة لاحقاً إن كانت مدفوعة فعلاً
  }
}
