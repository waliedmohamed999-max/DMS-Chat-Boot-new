import { IntegrationProvider } from "@prisma/client";
import type { IntegrationAdapter, SendMessageResult, SyncResult } from "@/lib/integrations/types";
import { SANDBOX_SALLA_ORDERS, SANDBOX_SALLA_PRODUCTS, sandboxAccountIdFor } from "@/lib/integrations/fixtures";
import { encryptSecret, verifyHmacSignature } from "@/lib/crypto";
import { withTenant } from "@/lib/db";
import { SALLA_OAUTH_BASE, fetchSallaUserInfo, parseSallaExpires, sallaInstallUrl } from "./api";
import { fullSallaSync } from "./sync";

/** مستقلة عن `PlatformSettings.integrationsMode` العام — نفس القرار وسببه الموثَّق في zid/adapter.ts. */
function hasRealSallaCredentials(): boolean {
  return Boolean(process.env.SALLA_CLIENT_ID && process.env.SALLA_CLIENT_SECRET);
}

function sallaRedirectUri(): string {
  return `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/integrations/salla/callback`;
}

/**
 * الربط الحقيقي مع سلة يتم بطريقتين:
 *  - النمط السهل (الموصى به والمطلوب للنشر في متجر تطبيقات سلة): التاجر يثبّت التطبيق من رابط التثبيت،
 *    وسلة ترسل الرموز في حدث app.store.authorize إلى /api/webhooks/salla (lib/integrations/salla/install.ts).
 *  - النمط المخصص (احتياطي عند عدم ضبط SALLA_APP_ID): OAuth تقليدي عبر /api/integrations/salla/callback.
 */
export const sallaAdapter: IntegrationAdapter = {
  provider: IntegrationProvider.SALLA,

  getAuthorizationUrl(tenantId: string, state?: string): string {
    const installUrl = sallaInstallUrl();
    if (installUrl) return installUrl;
    if (!hasRealSallaCredentials()) return `/dashboard/integrations?sandbox_connect=SALLA&tenant=${tenantId}`;
    const params = new URLSearchParams({
      client_id: process.env.SALLA_CLIENT_ID ?? "", response_type: "code", redirect_uri: sallaRedirectUri(),
      scope: "offline_access", ...(state ? { state } : {}),
    });
    return `${SALLA_OAUTH_BASE}/auth?${params.toString()}`;
  },

  async handleAuthorizationCallback(tenantId: string, code: string) {
    if (!hasRealSallaCredentials()) {
      const externalAccountId = sandboxAccountIdFor("salla");
      await withTenant(tenantId, async (tx) => {
        const data = {
          status: "CONNECTED" as const, isSandbox: true, externalAccountId,
          encryptedAccessToken: encryptSecret("sandbox-salla-token"), lastSyncedAt: new Date(), lastError: null,
          metadataJson: { storeName: "متجر سلة تجريبي", linkMethod: "sandbox" },
        };
        await tx.integration.upsert({
          where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
          update: data,
          create: { tenantId, provider: IntegrationProvider.SALLA, ...data },
        });
      });
      return { externalAccountId };
    }

    // النمط المخصص: تبادل حقيقي لرمز OAuth.
    const res = await fetch(`${SALLA_OAUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code", code,
        client_id: process.env.SALLA_CLIENT_ID ?? "", client_secret: process.env.SALLA_CLIENT_SECRET ?? "",
        redirect_uri: sallaRedirectUri(),
      }),
    });
    if (!res.ok) {
      // جسم الاستجابة الخام يُسجَّل في الخادم فقط — قد يحمل تفاصيل لا تُعرض للعميل في رابط إعادة التوجيه.
      console.error(`❌ فشل تبادل رمز OAuth مع سلة (${res.status}):`, await res.text());
      throw new Error("فشل تبادل رمز OAuth مع سلة");
    }
    const tokens = await res.json();
    const store = await fetchSallaUserInfo(tokens.access_token);

    await withTenant(tenantId, async (tx) => {
      const data = {
        status: "CONNECTED" as const, isSandbox: false, externalAccountId: store.merchantId,
        encryptedAccessToken: encryptSecret(tokens.access_token), encryptedRefreshToken: encryptSecret(tokens.refresh_token),
        tokenExpiresAt: parseSallaExpires(tokens.expires_in ?? tokens.expires), lastError: null,
        metadataJson: { merchantId: store.merchantId, storeName: store.storeName, storeDomain: store.storeDomain, storeEmail: store.email, linkMethod: "oauth_custom", installedAt: new Date().toISOString() },
      };
      await tx.integration.upsert({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
        update: data,
        create: { tenantId, provider: IntegrationProvider.SALLA, ...data },
      });
    });
    return { externalAccountId: store.merchantId };
  },

  async syncOrders(tenantId: string): Promise<SyncResult> {
    const integration = await withTenant(tenantId, (tx) =>
      tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } })
    );
    if (integration && !integration.isSandbox) return fullSallaSync(tenantId);

    // وضع Sandbox: بيانات تجريبية واقعية.
    let ordersSynced = 0;
    let productsSynced = 0;
    await withTenant(tenantId, async (tx) => {
      for (const [i, order] of SANDBOX_SALLA_ORDERS.entries()) {
        const contact = await tx.contact.upsert({
          where: { tenantId_phoneE164: { tenantId, phoneE164: `+96652${i}8880002` } },
          update: {},
          create: { tenantId, name: order.customerName, phoneE164: `+96652${i}8880002`, stage: "CUSTOMER", externalSallaId: order.id, source: "SALLA_SYNC" },
        });
        await tx.order.upsert({
          where: { tenantId_externalSource_externalId: { tenantId, externalSource: "SALLA", externalId: order.id } },
          update: { status: order.status as never, totalSar: order.total },
          create: { tenantId, contactId: contact.id, externalSource: "SALLA", externalId: order.id, status: order.status as never, totalSar: order.total },
        });
        ordersSynced++;
      }
      for (const p of SANDBOX_SALLA_PRODUCTS) {
        await tx.product.upsert({
          where: { tenantId_externalSource_externalId: { tenantId, externalSource: "SALLA", externalId: p.id } },
          update: { name: p.name, priceSar: p.priceSar, stockQty: p.stockQty, categoryName: p.categoryName, description: p.description },
          create: {
            tenantId, externalSource: "SALLA", externalId: p.id, name: p.name, priceSar: p.priceSar,
            stockQty: p.stockQty, categoryName: p.categoryName, description: p.description,
          },
        });
        productsSynced++;
      }
      await tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
        data: { lastSyncedAt: new Date() },
      });
    });
    return { ordersSynced, productsSynced };
  },

  async sendMessage(): Promise<SendMessageResult> {
    throw new Error("Salla adapter does not send WhatsApp messages directly — use metaAdapter.sendMessage().");
  },

  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    // X-Salla-Signature = HMAC-SHA256(rawBody, webhook secret) — موثَّق في docs.salla.dev. مسار الـwebhook
    // نفسه يدعم أيضاً خطة الحماية "Token" (راجع app/api/webhooks/salla/route.ts).
    const secret = process.env.SALLA_WEBHOOK_SECRET;
    if (!signatureHeader || !secret) return false;
    return verifyHmacSignature(rawBody, signatureHeader, secret);
  },

  async disconnect(tenantId: string) {
    await withTenant(tenantId, async (tx) => {
      await tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
        data: { status: "DISCONNECTED", encryptedAccessToken: null, encryptedRefreshToken: null, tokenExpiresAt: null },
      });
    });
  },
};
