import { NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/session";
import { withTenant, rawDb } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platformSettings";
import { invoiceDownloadResponse } from "@/lib/billing/invoicePdf";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  const invoice = await withTenant(tenantId, (tx) => tx.invoice.findUnique({ where: { id: params.id, tenantId } }));
  if (!invoice) return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });

  const [tenant, settings, owner, plan] = await Promise.all([
    rawDb.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    getPlatformSettings(),
    withTenant(tenantId, (tx) => tx.user.findFirst({ where: { tenantId, role: "OWNER" }, select: { email: true } })),
    invoice.planKey ? rawDb.plan.findUnique({ where: { key: invoice.planKey }, select: { name: true } }) : null,
  ]);

  return invoiceDownloadResponse({
    invoice,
    tenantName: tenant.billingLegalName || tenant.name,
    tenantVatNumber: tenant.billingVatNumber,
    tenantEmail: owner?.email ?? null,
    planName: plan?.name ?? null,
    seller: { sellerLegalName: settings.sellerLegalName, sellerVatNumber: settings.sellerVatNumber, sellerAddress: settings.sellerAddress },
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
  });
}
