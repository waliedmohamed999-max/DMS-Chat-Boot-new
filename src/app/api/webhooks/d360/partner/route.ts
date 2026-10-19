import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { verifyD360PartnerSignature } from "@/lib/integrations/d360/client";

/**
 * webhooks حساب الشريك في 360dialog (حالة القنوات، جودة الرقم): x-360dialog-signature = HMAC-SHA256(الجسم،
 * D360_WEBHOOK_SECRET). الأحداث: channel_created، channel_status_running/channel_running (القناة جاهزة
 * للإرسال)، phone_number_quality_changed. القناة تُطابَق بـ channelId المحفوظ عند الربط.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkIpRateLimit(ip, "webhook-d360-partner", 300, 60)).allowed) return new NextResponse("Rate limit exceeded", { status: 429 });

  const rawBody = await req.text();
  const payload = (() => { try { return JSON.parse(rawBody); } catch { return { raw: rawBody.slice(0, 2000) }; } })();
  const eventType = String(payload?.type ?? payload?.event ?? "unknown");

  if (!verifyD360PartnerSignature(rawBody, req.headers.get("x-360dialog-signature"))) {
    await superAdminDb.webhookLog.create({
      data: { provider: "D360DIALOG", eventType, payloadJson: payload, signatureValid: false, errorMessage: "Invalid signature" },
    });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const channelId = String(payload?.channel?.id ?? payload?.channel_id ?? payload?.data?.channel_id ?? payload?.data?.channel?.id ?? "");
  const integration = channelId ? await superAdminDb.integration.findUnique({ where: { channelId } }) : null;
  let note: string | null = null;

  if (!integration) {
    note = channelId ? "قناة غير مربوطة بأي تاجر بعد (تُربط عند عودة التاجر من صفحة 360dialog)" : "حدث بلا معرّف قناة";
  } else {
    const meta = (integration.metadataJson && typeof integration.metadataJson === "object" ? integration.metadataJson : {}) as Record<string, unknown>;
    if (eventType === "channel_status_running" || eventType === "channel_running") {
      await superAdminDb.integration.update({
        where: { id: integration.id },
        data: { pendingVerification: false, status: "CONNECTED", metadataJson: { ...meta, availability: "ready", runningAt: new Date().toISOString() } as Prisma.InputJsonValue },
      });
    } else if (eventType === "phone_number_quality_changed") {
      const quality = payload?.quality ?? payload?.data?.current_limit ?? payload?.data?.event ?? payload?.data?.quality_rating ?? null;
      await superAdminDb.integration.update({
        where: { id: integration.id },
        data: { metadataJson: { ...meta, qualityRating: quality, qualityUpdatedAt: new Date().toISOString() } as Prisma.InputJsonValue },
      });
    } else {
      note = "حدث مستلم — لا إجراء";
    }
  }

  await superAdminDb.webhookLog.create({
    data: {
      tenantId: integration?.tenantId ?? null, provider: "D360DIALOG", eventType: `partner:${eventType}`,
      payloadJson: payload as Prisma.InputJsonValue, signatureValid: true, processedAt: new Date(), errorMessage: note,
    },
  });
  return NextResponse.json({ ok: true });
}
