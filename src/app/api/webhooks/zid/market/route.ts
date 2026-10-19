import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { checkIpRateLimit, clientIp } from "@/lib/rateLimit";
import { timingSafeStringEqual } from "@/lib/crypto";
import { getZidConfig } from "@/lib/integrations/zid/config";
import { processZidMarketEvent, type ZidMarketPayload } from "@/lib/integrations/zid/market";

/**
 * أحداث متجر تطبيقات زد (تثبيت/حذف/اشتراكات/تقييم) — تُضبط في لوحة شركاء زد ← Webhooks مع ترويسة مخصّصة
 * X-DMS-Zid-Token = السر المولَّد في لوحة الأدمن ← تطبيق زد. بلا سر مضبوط: رفض كل شيء (fail closed).
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!(await checkIpRateLimit(ip, "webhook-zid-market", 300, 60)).allowed) return new NextResponse("Rate limit exceeded", { status: 429 });

  const rawBody = await req.text();
  let payload: ZidMarketPayload = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // يبقى فارغاً
  }
  const event = payload.event_name ?? "unknown";
  const secret = (await getZidConfig()).marketSecret;
  const token = req.headers.get("x-dms-zid-token") ?? "";
  if (!secret || !token || !timingSafeStringEqual(token, secret)) {
    await superAdminDb.webhookLog.create({ data: { provider: "ZID", eventType: event, payloadJson: { rejected: true }, signatureValid: false, errorMessage: "Invalid X-DMS-Zid-Token" } });
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const dedupeKey = `zid-market:${crypto.createHash("sha256").update(rawBody).digest("hex")}`;
  if ((await superAdminDb.webhookLog.findUnique({ where: { dedupeKey } }))?.processedAt) return NextResponse.json({ ok: true, duplicate: true });

  const logged = { event, store_id: payload.store_id ?? null, plan_name: payload.plan_name ?? null, status: payload.status ?? null, end_date: payload.end_date ?? null } as Prisma.InputJsonValue;
  try {
    const result = await processZidMarketEvent(payload);
    await superAdminDb.webhookLog
      .create({ data: { tenantId: result.tenantId, provider: "ZID", eventType: event, payloadJson: logged, signatureValid: true, processedAt: new Date(), errorMessage: result.note, dedupeKey } })
      .catch((err) => {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      });
    return NextResponse.json({ ok: true, note: result.note });
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل غير معروف";
    console.error(`❌ فشلت معالجة حدث متجر تطبيقات زد ${event}:`, message);
    await superAdminDb.webhookLog.create({ data: { provider: "ZID", eventType: event, payloadJson: logged, signatureValid: true, errorMessage: message.slice(0, 500) } });
    return new NextResponse("Processing failed", { status: 500 });
  }
}
