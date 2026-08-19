import { NextRequest, NextResponse } from "next/server";
import { zidAdapter } from "@/lib/integrations/zid/adapter";
import { superAdminDb, withTenant } from "@/lib/db";
import { checkTenantRateLimit, checkIpRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  // حد بعنوان IP قبل أي تحقّق توقيع أو كتابة قاعدة بيانات (راجع تعليق checkIpRateLimit في lib/rateLimit.ts).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "webhook-zid-unauth", 120, 60);
  if (!ipLimit.allowed) return new NextResponse("Rate limit exceeded", { status: 429 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-zid-signature");
  const signatureValid = await zidAdapter.verifyWebhookSignature(rawBody, signature);

  const payload = safeParse(rawBody);

  if (!signatureValid) {
    await superAdminDb.webhookLog.create({
      data: { provider: "ZID", eventType: payload?.event ?? "unknown", payloadJson: payload, signatureValid: false, errorMessage: "Invalid signature" },
    });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const storeId = payload?.store_id ?? payload?.merchant?.id;
  const integration = storeId
    ? await superAdminDb.integration.findFirst({ where: { provider: "ZID", externalAccountId: String(storeId) } })
    : null;

  if (!integration) {
    await superAdminDb.webhookLog.create({
      data: { provider: "ZID", eventType: payload?.event ?? "unmatched_account", payloadJson: payload, signatureValid: true, errorMessage: "لم يتم إيجاد متجر زد مطابق" },
    });
    return NextResponse.json({ ok: true });
  }

  const rateLimit = await checkTenantRateLimit(integration.tenantId, "webhook-zid", 300, 60);
  if (!rateLimit.allowed) {
    return new NextResponse("Rate limit exceeded", { status: 429 });
  }

  await withTenant(integration.tenantId, async (tx) => {
    await tx.webhookLog.create({
      data: {
        tenantId: integration.tenantId, provider: "ZID", eventType: payload?.event ?? "order_event",
        payloadJson: payload, signatureValid: true, processedAt: new Date(),
      },
    });
    // حدث "عربة متروكة" يشغّل رسالة استرداد تلقائية (تُلتقط لاحقاً من عامل الحملات)
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
