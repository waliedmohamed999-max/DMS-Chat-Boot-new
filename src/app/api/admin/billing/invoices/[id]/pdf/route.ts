import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platformSettings";
import { generateInvoicePdfBuffer } from "@/lib/billing/invoicePdf";

/** نفس مولّد PDF المستخدَم من جانب التاجر، لكن عبر جلسة فريق المنصة (superAdminDb، عابر للتجار). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSuperAdminSession();
  try {
    requirePermission(session.user.role, "platform.view_revenue");
  } catch {
    return NextResponse.json({ error: "لا تملك صلاحية عرض الفواتير." }, { status: 403 });
  }

  const invoice = await superAdminDb.invoice.findUnique({ where: { id: params.id }, include: { tenant: true } });
  if (!invoice) return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });

  const [settings, owner, plan] = await Promise.all([
    getPlatformSettings(),
    superAdminDb.user.findFirst({ where: { tenantId: invoice.tenantId, role: "OWNER" }, select: { email: true } }),
    invoice.planKey ? superAdminDb.plan.findUnique({ where: { key: invoice.planKey }, select: { name: true } }) : null,
  ]);

  const buffer = await generateInvoicePdfBuffer({
    invoice,
    tenantName: invoice.tenant.name,
    tenantEmail: owner?.email ?? null,
    planName: plan?.name ?? null,
    seller: { sellerLegalName: settings.sellerLegalName, sellerVatNumber: settings.sellerVatNumber, sellerAddress: settings.sellerAddress },
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
    },
  });
}
