import { IntegrationProvider } from "@prisma/client";
import type { IntegrationAdapter, SendMessageResult, SyncResult } from "@/lib/integrations/types";
import { SANDBOX_ZID_ORDERS, SANDBOX_ZID_PRODUCTS, sandboxAccountIdFor } from "@/lib/integrations/fixtures";
import { encryptSecret } from "@/lib/crypto";
import { withTenant } from "@/lib/db";
import { ZID_OAUTH_BASE, findZidIntegrationByWebhookAuth, zidRedirectUri } from "./api";
import { zidConfigCached } from "./config";
import { fullZidSync } from "./sync";

/**
 * زد مستقلة عن `PlatformSettings.integrationsMode` العام: ضبط تطبيق زد حقيقي (لوحة الأدمن ← تطبيق زد أو
 * متغيرات ZID_*) يكفي وحده لتفعيل الربط الحقيقي لهذا المزوّد. التثبيت من متجر تطبيقات زد والربط من لوحة
 * DMS يمرّان كلاهما عبر /api/zid/oauth/callback (lib/integrations/zid/install.ts).
 */
function hasRealZidCredentials(): boolean {
  const c = zidConfigCached();
  return Boolean(c.clientId && c.clientSecret);
}

export const zidAdapter: IntegrationAdapter = {
  provider: IntegrationProvider.ZID,

  getAuthorizationUrl(tenantId: string, state?: string): string {
    if (!hasRealZidCredentials()) return `/dashboard/integrations?sandbox_connect=ZID&tenant=${tenantId}`;
    const params = new URLSearchParams({
      client_id: zidConfigCached().clientId ?? "", response_type: "code", redirect_uri: zidRedirectUri(),
      ...(state ? { state } : {}),
    });
    return `${ZID_OAUTH_BASE}/authorize?${params.toString()}`;
  },

  async handleAuthorizationCallback(tenantId: string, code: string) {
    if (!hasRealZidCredentials()) {
      const externalAccountId = sandboxAccountIdFor("zid");
      await withTenant(tenantId, async (tx) => {
        await tx.integration.upsert({
          where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
          update: {
            status: "CONNECTED", isSandbox: true, externalAccountId,
            encryptedAccessToken: encryptSecret("sandbox-zid-token"), lastSyncedAt: new Date(), lastError: null,
          },
          create: {
            tenantId, provider: IntegrationProvider.ZID, status: "CONNECTED", isSandbox: true,
            externalAccountId, encryptedAccessToken: encryptSecret("sandbox-zid-token"), lastSyncedAt: new Date(),
          },
        });
      });
      return { externalAccountId };
    }

    // وضع Live: نفس مسار التثبيت من متجر تطبيقات زد (تبادل الرمز، بيانات المتجر، اشتراك الأحداث، المزامنة).
    const { handleZidOAuthCallback } = await import("./install");
    const result = await handleZidOAuthCallback(code, { mode: "dashboard", tenantId, userId: "" });
    if (result.outcome === "conflict") throw new Error(result.reason);
    return { externalAccountId: result.storeId };
  },

  async syncOrders(tenantId: string): Promise<SyncResult> {
    const integration = await withTenant(tenantId, (tx) =>
      tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } } })
    );
    if (!integration || integration.isSandbox) {
      let ordersSynced = 0;
      let productsSynced = 0;
      await withTenant(tenantId, async (tx) => {
        for (const [i, order] of SANDBOX_ZID_ORDERS.entries()) {
          const contact = await tx.contact.upsert({
            where: { tenantId_phoneE164: { tenantId, phoneE164: `+96650${i}9990001` } },
            update: {},
            create: { tenantId, name: order.customerName, phoneE164: `+96650${i}9990001`, stage: "CUSTOMER", externalZidId: order.id, source: "ZID_SYNC" },
          });
          await tx.order.upsert({
            where: { tenantId_externalSource_externalId: { tenantId, externalSource: "ZID", externalId: order.id } },
            update: { status: order.status as never, totalSar: order.total },
            create: {
              tenantId, contactId: contact.id, externalSource: "ZID", externalId: order.id,
              status: order.status as never, totalSar: order.total,
            },
          });
          ordersSynced++;
        }
        for (const p of SANDBOX_ZID_PRODUCTS) {
          await tx.product.upsert({
            where: { tenantId_externalSource_externalId: { tenantId, externalSource: "ZID", externalId: p.id } },
            update: { name: p.name, priceSar: p.priceSar, stockQty: p.stockQty, categoryName: p.categoryName, description: p.description },
            create: {
              tenantId, externalSource: "ZID", externalId: p.id, name: p.name, priceSar: p.priceSar,
              stockQty: p.stockQty, categoryName: p.categoryName, description: p.description,
            },
          });
          productsSynced++;
        }
        await tx.integration.update({
          where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
          data: { lastSyncedAt: new Date() },
        });
      });
      return { ordersSynced, productsSynced };
    }

    const r = await fullZidSync(tenantId);
    return { ordersSynced: r.orders, productsSynced: r.products };
  },

  async sendMessage(): Promise<SendMessageResult> {
    throw new Error("Zid adapter does not send WhatsApp messages directly — use metaAdapter.sendMessage().");
  },

  /** أحداث متجر زد تُوثَّق بـBasic Auth (رقم المتجر + رمز عشوائي خاص به) — `signatureHeader` = ترويسة Authorization. */
  async verifyWebhookSignature(_rawBody: string, signatureHeader: string | null): Promise<boolean> {
    return Boolean(await findZidIntegrationByWebhookAuth(signatureHeader));
  },

  async disconnect(tenantId: string) {
    await withTenant(tenantId, async (tx) => {
      await tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
        data: { status: "DISCONNECTED", encryptedAccessToken: null, encryptedRefreshToken: null, webhookTokenHash: null, webhookSubscribed: false },
      });
    });
  },
};

