import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { checkIpRateLimit, clientIp } from "@/lib/rateLimit";
import { buildEmbeddedSummary, introspectEmbeddedToken, issueEmbeddedSession } from "@/lib/integrations/salla/embedded";

function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

/**
 * بداية جلسة صفحة DMS داخل لوحة سلة: رمز Embedded SDK ← Introspection سلة ← التاجر ← حسابه عندنا.
 * الحالات: linked (جلسة + ملخص) | awaiting_confirmation (طلب ربط ببريد آخر لم يُؤكَّد) | not_linked.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!(await checkIpRateLimit(ip, "salla-embedded-session", 60, 60)).allowed) {
    return NextResponse.json({ error: "طلبات كثيرة" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  const identity = token ? await introspectEmbeddedToken(token) : null;
  if (!identity) return NextResponse.json({ error: "رمز سلة غير صالح أو منتهي" }, { status: 401 });

  const integration = await superAdminDb.integration.findFirst({
    where: { provider: IntegrationProvider.SALLA, externalAccountId: identity.merchantId, isSandbox: false },
    select: { tenantId: true, status: true },
  });
  if (integration && integration.status !== "DISCONNECTED") {
    const session = await issueEmbeddedSession(identity.merchantId, integration.tenantId);
    return NextResponse.json({ state: "linked", session, summary: await buildEmbeddedSummary(integration.tenantId) });
  }

  const intent = await superAdminDb.sallaInstallIntent.findUnique({ where: { merchantId: identity.merchantId } });
  if (intent?.status === "AWAITING_CONFIRMATION" && intent.requestedEmail) {
    return NextResponse.json({ state: "awaiting_confirmation", email: maskEmail(intent.requestedEmail) });
  }
  return NextResponse.json({ state: "not_linked" });
}
