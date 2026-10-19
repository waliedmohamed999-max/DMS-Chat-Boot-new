import { NextRequest, NextResponse } from "next/server";
import { getSallaConfig } from "@/lib/integrations/salla/config";
import { Prisma } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { verifyHmacSignature } from "@/lib/crypto";
import { handleSallaCommunication, redactCommunication } from "@/lib/integrations/salla/communication";

/**
 * تستدعيه دالة communication.whatsapp.send في تطبيق DMS على سلة (كودها في docs/SALLA_APP_SETUP.md) لكل
 * رسالة متجر يجب إرسالها عبر واتساب. نفس مصادقة دوال خطوات الإعداد: X-DMS-Signature (SALLA_FUNCTIONS_SECRET).
 * الرد: 200 {ok, sent, skipped} أو حالة خطأ مع {message} — الدالة تعيد النجاح/الفشل لسلة بناءً عليه.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkIpRateLimit(ip, "salla-communication-ip", 1200, 60)).allowed) {
    return NextResponse.json({ message: "طلبات كثيرة" }, { status: 429 });
  }

  const secret = (await getSallaConfig()).functionsSecret;
  const rawBody = await req.text();
  const signature = req.headers.get("x-dms-signature");
  if (!secret || !signature || !verifyHmacSignature(rawBody, signature, secret)) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const result = await handleSallaCommunication(payload).catch((err) => ({
    ok: false as const, status: 500, error: err instanceof Error ? err.message : "فشل غير معروف",
  }));

  const integration = payload?.merchant != null
    ? await superAdminDb.integration.findFirst({ where: { provider: "SALLA", externalAccountId: String(payload.merchant), isSandbox: false }, select: { tenantId: true } })
    : null;
  await superAdminDb.webhookLog.create({
    data: {
      tenantId: integration?.tenantId ?? null, provider: "SALLA",
      eventType: `${payload?.event ?? "communication"}:${payload?.data?.type ?? "message"}`,
      payloadJson: redactCommunication(payload) as Prisma.InputJsonValue, signatureValid: true, processedAt: new Date(),
      errorMessage: result.ok ? (result.skipped ? `أُرسلت ${result.sent}، تخطّي ${result.skipped}` : null) : result.error,
    },
  });

  return result.ok
    ? NextResponse.json({ ok: true, sent: result.sent, skipped: result.skipped })
    : NextResponse.json({ message: result.error }, { status: result.status });
}
