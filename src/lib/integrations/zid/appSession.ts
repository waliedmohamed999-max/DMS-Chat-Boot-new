import { SignJWT, jwtVerify } from "jose";
import { IntegrationProvider } from "@prisma/client";
import { superAdminDb, withTenant } from "@/lib/db";
import { appBaseUrl } from "./api";
import { getZidSyncState, type ZidSyncState } from "./sync";

/**
 * جلسة صفحة تطبيق DMS لتاجر زد (/zid/app): تُصدر بعد نجاح OAuth في /api/zid/oauth/callback (فتح التطبيق من
 * لوحة زد يمر دائماً عبر التفويض، فلا يصل للصفحة إلا صاحب المتجر المصادَق من زد). Bearer لا كوكيز.
 */
const AUDIENCE = "zid-app";
const SESSION_TTL_SECONDS = 2 * 3600;

function key() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET غير مضبوط");
  return new TextEncoder().encode(secret);
}

export async function issueZidAppSession(storeId: string, tenantId: string): Promise<string> {
  return new SignJWT({ storeId, tenantId }).setProtectedHeader({ alg: "HS256" }).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(`${SESSION_TTL_SECONDS}s`).sign(key());
}

export async function verifyZidAppSession(authorization: string | null): Promise<{ storeId: string; tenantId: string } | null> {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: AUDIENCE });
    if (typeof payload.storeId !== "string" || typeof payload.tenantId !== "string") return null;
    // الربط قد يُفصل أثناء الجلسة (حذف التطبيق) — نتحقق أن المتجر ما زال مربوطاً بنفس الحساب.
    const integration = await superAdminDb.integration.findFirst({
      where: { provider: IntegrationProvider.ZID, externalAccountId: payload.storeId, tenantId: payload.tenantId, isSandbox: false, status: { not: "DISCONNECTED" } },
      select: { id: true },
    });
    return integration ? { storeId: payload.storeId, tenantId: payload.tenantId } : null;
  } catch {
    return null;
  }
}

export type ZidAppSummary = {
  tenant: { name: string; status: string };
  owner: { email: string; passwordSet: boolean };
  store: { name: string | null; status: string; lastSyncedAt: string | null; lastError: string | null; webhooks: boolean };
  counts: { orders: number; abandonedCarts: number; contacts: number; products: number };
  whatsappConnected: boolean;
  sync: ZidSyncState | null;
  dashboardUrl: string;
};

export async function buildZidAppSummary(tenantId: string): Promise<ZidAppSummary> {
  const [tenant, owner, integration, orders, carts, contacts, products, whatsapp] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, status: true } }),
      tx.user.findFirst({ where: { tenantId, role: "OWNER" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, lastLoginAt: true } }),
      tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } } }),
      tx.order.count({ where: { tenantId, externalSource: "ZID", status: { not: "ABANDONED_CART" } } }),
      tx.order.count({ where: { tenantId, externalSource: "ZID", status: "ABANDONED_CART" } }),
      tx.contact.count({ where: { tenantId, source: "ZID_SYNC" } }),
      tx.product.count({ where: { tenantId, externalSource: "ZID" } }),
      tx.integration.count({ where: { tenantId, provider: { in: ["D360DIALOG", "META_WHATSAPP"] }, status: "CONNECTED" } }),
    ])
  );
  const passwordSet = owner ? owner.lastLoginAt !== null || (await superAdminDb.accountSetupToken.count({ where: { userId: owner.id, usedAt: { not: null } } })) > 0 : false;
  const meta = (integration?.metadataJson ?? {}) as { storeName?: string | null };
  return {
    tenant,
    owner: { email: owner?.email ?? "", passwordSet },
    store: {
      name: meta.storeName ?? null, status: integration?.status ?? "DISCONNECTED",
      lastSyncedAt: integration?.lastSyncedAt?.toISOString() ?? null, lastError: integration?.lastError ?? null, webhooks: Boolean(integration?.webhookSubscribed),
    },
    counts: { orders, abandonedCarts: carts, contacts, products },
    whatsappConnected: whatsapp > 0,
    sync: await getZidSyncState(tenantId),
    dashboardUrl: `${appBaseUrl()}/dashboard`,
  };
}
