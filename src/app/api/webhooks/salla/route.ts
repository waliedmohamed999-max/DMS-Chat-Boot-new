import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSallaConfig } from "@/lib/integrations/salla/config";
import { Prisma } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { timingSafeStringEqual, verifyHmacSignature } from "@/lib/crypto";
import { processSallaEvent, type SallaEventPayload } from "@/lib/integrations/salla/events";

/**
 * استقبال أحداث سلة (تنبيهات التطبيق + أحداث المتجر). الخطوات بترتيبها المقصود:
 *  1) حد بعنوان IP قبل أي عمل (مسار عام بالضرورة).
 *  2) التحقق من المصدر حسب "خطة حماية التنبيهات" المختارة في بوابة شركاء سلة:
 *     Signature → X-Salla-Signature = HMAC-SHA256(الجسم الخام، المفتاح السري) | Token → Authorization = المفتاح السري.
 *  3) منع التكرار: سلة تعيد إرسال الحدث حتى 3 مرات عند عدم وصول رد ناجح خلال 30 ثانية — مفتاح
 *     SHA-256 للجسم الخام يضمن معالجة كل حدث مرة واحدة فقط.
 *  4) المعالجة الفعلية؛ فشلها يعيد 500 فتعيد سلة الإرسال لاحقاً (المعالجة نفسها upsert آمنة للتكرار).
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "webhook-salla", 600, 60);
  if (!ipLimit.allowed) return new NextResponse("Rate limit exceeded", { status: 429 });

  const rawBody = await req.text();
  const payload = safeParse(rawBody);
  const eventType = typeof payload?.event === "string" ? payload.event : "unknown";

  if (!verifySallaRequest(req, rawBody, (await getSallaConfig()).webhookSecret)) {
    await superAdminDb.webhookLog.create({
      data: { provider: "SALLA", eventType, payloadJson: redact(payload), signatureValid: false, errorMessage: "Invalid signature/token" },
    });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const dedupeKey = `salla:${crypto.createHash("sha256").update(rawBody).digest("hex")}`;
  const already = await superAdminDb.webhookLog.findUnique({ where: { dedupeKey } });
  if (already?.processedAt) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const result = await processSallaEvent(payload as SallaEventPayload);
    await superAdminDb.webhookLog
      .create({
        data: {
          tenantId: result.tenantId, provider: "SALLA", eventType, payloadJson: redact(payload), signatureValid: true,
          processedAt: new Date(), errorMessage: result.unmatched ? result.note : null, dedupeKey,
        },
      })
      .catch((err) => {
        // تسابق نادر بين إعادتي إرسال متزامنتين — المعالجة نفسها آمنة للتكرار، فيكفي تجاهل تعارض المفتاح.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      });
    return NextResponse.json({ ok: true, note: result.note });
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل غير معروف";
    console.error(`❌ فشلت معالجة حدث سلة ${eventType}:`, message);
    await superAdminDb.webhookLog.create({
      data: { provider: "SALLA", eventType, payloadJson: redact(payload), signatureValid: true, errorMessage: message.slice(0, 500) },
    });
    return new NextResponse("Processing failed", { status: 500 });
  }
}

function verifySallaRequest(req: NextRequest, rawBody: string, secret: string | null): boolean {
  if (!secret) return false; // بلا مفتاح سري مضبوط: رفض كل شيء (fail closed)
  const strategy = (req.headers.get("x-salla-security-strategy") ?? "").toLowerCase();
  const signature = req.headers.get("x-salla-signature");

  if (strategy === "token") {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (token && timingSafeStringEqual(token, secret)) return true;
  }
  return !!signature && verifyHmacSignature(rawBody, signature, secret);
}

/** رموز الوصول في حدث app.store.authorize لا تُحفظ أبداً في سجل الأحداث (تُخزَّن مشفَّرة في Integration فقط). */
function redact(payload: any): Prisma.InputJsonValue {
  if (payload?.event === "app.store.authorize" && payload.data) {
    return { ...payload, data: { ...payload.data, access_token: "[redacted]", refresh_token: "[redacted]" } };
  }
  return payload ?? {};
}

function safeParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw: raw.slice(0, 2000) };
  }
}
