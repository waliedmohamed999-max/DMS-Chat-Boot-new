import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { superAdminDb, withTenant } from "@/lib/db";
import { checkIpRateLimit, checkTenantRateLimit } from "@/lib/rateLimit";
import { findZidIntegrationByWebhookAuth, ZID_STORE_EVENTS } from "@/lib/integrations/zid/api";
import { processZidStoreEvent } from "@/lib/integrations/zid/events";

/**
 * أحداث متجر زد (اشتراكات POST /managers/webhooks): اسم الحدث في الرابط (?event=)، والمصدر يُوثَّق بـBasic
 * Auth يرسلها زد مع كل حدث (رقم المتجر + رمز عشوائي خاص بالمتجر، نقارن بصمته). منع التكرار بمفتاح
 * SHA-256 للحدث+الجسم؛ فشل المعالجة يعيد 500 فيعيد زد الإرسال.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!(await checkIpRateLimit(ip, "webhook-zid", 600, 60)).allowed) return new NextResponse("Rate limit exceeded", { status: 429 });

  const event = req.nextUrl.searchParams.get("event") ?? "unknown";
  const rawBody = await req.text();
  const payload = safeParse(rawBody);

  const integration = await findZidIntegrationByWebhookAuth(req.headers.get("authorization"));
  if (!integration) {
    await superAdminDb.webhookLog.create({ data: { provider: "ZID", eventType: event, payloadJson: { rejected: true }, signatureValid: false, errorMessage: "Invalid Basic auth" } });
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const tenantId = integration.tenantId;
  if (!(ZID_STORE_EVENTS as readonly string[]).includes(event)) return NextResponse.json({ ok: true, ignored: true });
  if (!(await checkTenantRateLimit(tenantId, "webhook-zid", 600, 60)).allowed) return new NextResponse("Rate limit exceeded", { status: 429 });
  if (integration.status === "DISCONNECTED") return NextResponse.json({ ok: true, note: "الربط مفصول" });

  const dedupeKey = `zid:${crypto.createHash("sha256").update(`${event}\n${rawBody}`).digest("hex")}`;
  if ((await superAdminDb.webhookLog.findUnique({ where: { dedupeKey } }))?.processedAt) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const result = await processZidStoreEvent(tenantId, event, payload);
    await withTenant(tenantId, (tx) =>
      tx.webhookLog.create({
        data: { tenantId, provider: "ZID", eventType: event, payloadJson: summarize(payload), signatureValid: true, processedAt: new Date(), errorMessage: result.note, dedupeKey },
      })
    ).catch((err) => {
      // تسابق نادر بين إعادتي إرسال متزامنتين — المعالجة نفسها آمنة للتكرار.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    });
    return NextResponse.json({ ok: true, note: result.note });
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل غير معروف";
    console.error(`❌ فشلت معالجة حدث زد ${event}:`, message);
    await superAdminDb.webhookLog.create({ data: { tenantId, provider: "ZID", eventType: event, payloadJson: summarize(payload), signatureValid: true, errorMessage: message.slice(0, 500) } });
    return new NextResponse("Processing failed", { status: 500 });
  }
}

function safeParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** لا نخزّن بيانات العميل الشخصية كاملة في سجل الأحداث — المعرّفات والحالة فقط. */
function summarize(payload: any): Prisma.InputJsonValue {
  const d = payload?.data ?? payload ?? {};
  return { id: d?.id ?? null, code: d?.code ?? null, status: d?.order_status?.code ?? (typeof d?.status === "string" ? d.status : null) };
}
