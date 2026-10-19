import { SignJWT, jwtVerify } from "jose";
import { IntegrationProvider } from "@prisma/client";
import { superAdminDb, withTenant } from "@/lib/db";
import { getAutomationStates, type AutomationState } from "./automations";

// قابل للتغيير عبر البيئة للاختبار المحلي فقط (خادم سلة وهمي) — الافتراضي خادم سلة الحقيقي.
const EXCHANGE_BASE = process.env.SALLA_EXCHANGE_BASE_URL || "https://api.salla.dev/exchange-authority/v1";
const SESSION_TTL_SECONDS = 2 * 3600;
const AUDIENCE = "salla-embedded";

/**
 * التحقق من رمز الصفحة المضمَّنة (Embedded SDK) عبر Introspection API لسلة — المصدر الوحيد الموثوق
 * لمعرفة التاجر الذي فتح الصفحة (لا يُعتمد على أي قيمة من المتصفح). docs.salla.dev/embedded-sdk/authentication
 */
export async function introspectEmbeddedToken(token: string): Promise<{ merchantId: string; userId: string | null } | null> {
  const appId = process.env.SALLA_APP_ID;
  if (!appId || !token) return null;
  const res = await fetch(`${EXCHANGE_BASE}/introspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "S-Source": appId },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const data = body?.data;
  if (!body?.success || data?.merchant_id == null) return null;
  if (data.exp && new Date(data.exp).getTime() < Date.now()) return null;
  return { merchantId: String(data.merchant_id), userId: data.user_id != null ? String(data.user_id) : null };
}

function sessionKey() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET غير مضبوط");
  return new TextEncoder().encode(secret);
}

/** جلسة خاصة بالصفحة المضمَّنة (Bearer في الطلبات، لا كوكيز — كوكيز الطرف الثالث داخل iframe تحظرها المتصفحات). */
export async function issueEmbeddedSession(merchantId: string, tenantId: string): Promise<string> {
  return new SignJWT({ merchantId, tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionKey());
}

export async function verifyEmbeddedSession(authorization: string | null): Promise<{ merchantId: string; tenantId: string } | null> {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { audience: AUDIENCE });
    if (typeof payload.merchantId !== "string" || typeof payload.tenantId !== "string") return null;
    // الربط قد يُفصل أثناء الجلسة — نتحقق أن المتجر ما زال مربوطاً بنفس الحساب.
    const integration = await superAdminDb.integration.findFirst({
      where: { provider: IntegrationProvider.SALLA, externalAccountId: payload.merchantId, tenantId: payload.tenantId, isSandbox: false },
      select: { id: true },
    });
    return integration ? { merchantId: payload.merchantId, tenantId: payload.tenantId } : null;
  } catch {
    return null;
  }
}

export type EmbeddedSummary = {
  tenant: { name: string; status: string };
  owner: { email: string; passwordSet: boolean };
  store: { name: string | null; status: string; lastSyncedAt: string | null; lastError: string | null };
  counts: { orders: number; abandonedCarts: number; pendingRecovery: number; contacts: number; products: number; needsReply: number };
  whatsappConnected: boolean;
  automations: AutomationState[];
  dashboardUrl: string;
};

export async function buildEmbeddedSummary(tenantId: string): Promise<EmbeddedSummary> {
  const [tenant, owner, integration, ordersByStatus, pendingRecovery, contacts, products, needsReply, whatsapp] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, status: true } }),
      tx.user.findFirst({ where: { tenantId, role: "OWNER" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, lastLoginAt: true } }),
      tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } }),
      tx.order.groupBy({ by: ["status"], where: { tenantId, externalSource: "SALLA" }, _count: { _all: true } }),
      tx.order.count({ where: { tenantId, externalSource: "SALLA", status: "ABANDONED_CART", recoveryMessageSentAt: null } }),
      tx.contact.count({ where: { tenantId, source: "SALLA_SYNC" } }),
      tx.product.count({ where: { tenantId, externalSource: "SALLA" } }),
      tx.conversation.count({ where: { tenantId, status: { in: ["NEW", "NEEDS_REPLY"] } } }),
      tx.integration.count({ where: { tenantId, provider: { in: ["META_WHATSAPP", "WHATSAPP_QR"] }, status: "CONNECTED" } }),
    ])
  );
  // حساب أُنشئ من تثبيت سلة ولم يُستخدم رابط تحديد كلمة المرور بعد ⇐ لم يسجّل دخولاً أبداً.
  const passwordSet = owner ? owner.lastLoginAt !== null || (await superAdminDb.accountSetupToken.count({ where: { userId: owner.id, usedAt: { not: null } } })) > 0 : false;
  const meta = (integration?.metadataJson ?? {}) as { storeName?: string | null };
  return {
    tenant,
    owner: { email: owner?.email ?? "", passwordSet },
    store: {
      name: meta.storeName ?? null,
      status: integration?.status ?? "DISCONNECTED",
      lastSyncedAt: integration?.lastSyncedAt?.toISOString() ?? null,
      lastError: integration?.lastError ?? null,
    },
    counts: {
      orders: ordersByStatus.filter((o) => o.status !== "ABANDONED_CART").reduce((n, o) => n + o._count._all, 0),
      abandonedCarts: ordersByStatus.find((o) => o.status === "ABANDONED_CART")?._count._all ?? 0,
      pendingRecovery, contacts, products, needsReply,
    },
    whatsappConnected: whatsapp > 0,
    automations: await getAutomationStates(tenantId),
    dashboardUrl: `${process.env.NEXTAUTH_URL || ""}/dashboard`,
  };
}
