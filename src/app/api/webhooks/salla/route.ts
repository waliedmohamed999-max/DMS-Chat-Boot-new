import { NextRequest, NextResponse } from "next/server";
import { sallaAdapter } from "@/lib/integrations/salla/adapter";
import { superAdminDb, withTenant } from "@/lib/db";
import { checkTenantRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-salla-signature");
  const signatureValid = await sallaAdapter.verifyWebhookSignature(rawBody, signature);

  const payload = safeParse(rawBody);

  if (!signatureValid) {
    await superAdminDb.webhookLog.create({
      data: { provider: "SALLA", eventType: payload?.event ?? "unknown", payloadJson: payload, signatureValid: false, errorMessage: "Invalid signature" },
    });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const merchantId = payload?.merchant;
  const integration = merchantId
    ? await superAdminDb.integration.findFirst({ where: { provider: "SALLA", externalAccountId: String(merchantId) } })
    : null;

  if (!integration) {
    await superAdminDb.webhookLog.create({
      data: { provider: "SALLA", eventType: payload?.event ?? "unmatched_account", payloadJson: payload, signatureValid: true, errorMessage: "لم يتم إيجاد متجر سلة مطابق" },
    });
    return NextResponse.json({ ok: true });
  }

  const rateLimit = await checkTenantRateLimit(integration.tenantId, "webhook-salla", 300, 60);
  if (!rateLimit.allowed) {
    return new NextResponse("Rate limit exceeded", { status: 429 });
  }

  await withTenant(integration.tenantId, async (tx) => {
    await tx.webhookLog.create({
      data: {
        tenantId: integration.tenantId, provider: "SALLA", eventType: payload?.event ?? "order_event",
        payloadJson: payload, signatureValid: true, processedAt: new Date(),
      },
    });
  });

  return NextResponse.json({ ok: true });
}

function safeParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}
