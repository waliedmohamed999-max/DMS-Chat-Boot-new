import { NextRequest, NextResponse } from "next/server";
import { getSallaConfig } from "@/lib/integrations/salla/config";
import { checkIpRateLimit, checkTenantRateLimit, clientIp } from "@/lib/rateLimit";
import { verifyHmacSignature } from "@/lib/crypto";
import { saveOnboardingStep } from "@/lib/integrations/salla/intent";

/**
 * تستدعيه دوال "خطوات تثبيت التطبيق" (App Functions) في بوابة شركاء سلة عند إرسال التاجر لنموذج خطوة —
 * الكود المرجعي للدوال في docs/SALLA_APP_SETUP.md. المصادقة: X-DMS-Signature = HMAC-SHA256(الجسم الخام،
 * SALLA_FUNCTIONS_SECRET) — مفتاح منفصل عن مفتاح الـwebhook لأنه يُكتب داخل كود الدالة في بوابة سلة.
 * الرد: 200 {ok:true} أو 422 {message, fields:{<معرّف الحقل>: [رسائل]}} لتعرضها الدالة تحت كل حقل.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!(await checkIpRateLimit(ip, "salla-onboarding", 120, 60)).allowed) {
    return NextResponse.json({ message: "طلبات كثيرة" }, { status: 429 });
  }

  const secret = (await getSallaConfig()).functionsSecret;
  const rawBody = await req.text();
  const signature = req.headers.get("x-dms-signature");
  if (!secret || !signature || !verifyHmacSignature(rawBody, signature, secret)) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
  }

  let body: { merchant_id?: unknown; step?: unknown; fields?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const merchantId = body.merchant_id != null ? String(body.merchant_id) : "";
  const step = typeof body.step === "string" ? body.step : "";
  if (!merchantId || !step) return NextResponse.json({ message: "merchant_id و step مطلوبان" }, { status: 400 });
  if (!(await checkTenantRateLimit(merchantId, "salla-onboarding-merchant", 30, 600)).allowed) {
    return NextResponse.json({ message: "محاولات كثيرة — حاول بعد قليل" }, { status: 429 });
  }

  const fields = body.fields && typeof body.fields === "object" ? (body.fields as Record<string, unknown>) : {};
  const result = await saveOnboardingStep(merchantId, step, fields);
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ message: result.message, fields: result.fields }, { status: 422 });
}
