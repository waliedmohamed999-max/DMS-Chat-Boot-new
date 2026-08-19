import { IntegrationProvider } from "@prisma/client";
import type { IntegrationAdapter, SendMessageResult, SyncResult } from "@/lib/integrations/types";
import { SANDBOX_ZID_ORDERS, sandboxAccountIdFor } from "@/lib/integrations/fixtures";
import { encryptSecret, decryptSecret, verifyHmacSignature } from "@/lib/crypto";
import { withTenant } from "@/lib/db";

const ZID_OAUTH_BASE = "https://oauth.zid.sa/oauth";
const ZID_API_BASE = "https://api.zid.sa/v1";

/**
 * زد/سلة تعتمدان استقلالاً عن `PlatformSettings.integrationsMode` العام (الذي يبقى يتحكم بـ
 * Meta/WhatsApp QR فقط) — قرار صريح: تفعيل بيانات اعتماد تطبيق حقيقية لزد تحديداً يكفي وحده لتفعيل
 * وضع Live لهذا المزوّد بالذات، بلا حاجة لقلب المنصة كاملة لوضع "live" (كان سيُفعِّل Live خطأً لكل
 * تكامل آخر بلا اتصال حقيقي فعلي، بما فيها واتساب Meta). راجع DECISIONS.md.
 */
function hasRealZidCredentials(): boolean {
  return Boolean(process.env.ZID_CLIENT_ID && process.env.ZID_CLIENT_SECRET);
}

function baseUrl(): string {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function zidRedirectUri(): string {
  return `${baseUrl()}/api/integrations/zid/callback`;
}

/** زد تُعيد **رمزين** منفصلين وجب تمريرهما معاً في كل طلب API (Authorization Bearer + X-Manager-Token)
 * — نخزّنهما معاً كـJSON مشفَّر واحد في عمود encryptedAccessToken بدل إضافة عمود جديد بالسكيما. */
type ZidTokenBundle = { authorization: string; accessToken: string };

function encryptZidTokenBundle(bundle: ZidTokenBundle): string {
  return encryptSecret(JSON.stringify(bundle));
}

function decryptZidTokenBundle(ciphertext: string): ZidTokenBundle {
  return JSON.parse(decryptSecret(ciphertext)) as ZidTokenBundle;
}

type ZidTokenResponse = { access_token: string; authorization: string; refresh_token: string; expires_in: number };

async function exchangeCodeForTokens(code: string): Promise<ZidTokenResponse> {
  const res = await fetch(`${ZID_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code,
      client_id: process.env.ZID_CLIENT_ID ?? "", client_secret: process.env.ZID_CLIENT_SECRET ?? "",
      redirect_uri: zidRedirectUri(),
    }),
  });
  if (!res.ok) {
    // جسم الاستجابة الخام لا يُدرَج في رسالة الخطأ المُلقاة (تصل مباشرة لعنوان إعادة توجيه مرئي
    // للمتصفح في route.ts) — يُسجَّل هنا فقط في سجلات الخادم.
    console.error(`❌ فشل تبادل رمز OAuth مع زد (${res.status}):`, await res.text());
    throw new Error("فشل تبادل رمز OAuth مع زد");
  }
  return res.json();
}

async function refreshTokens(refreshToken: string): Promise<ZidTokenResponse> {
  const res = await fetch(`${ZID_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", refresh_token: refreshToken,
      client_id: process.env.ZID_CLIENT_ID ?? "", client_secret: process.env.ZID_CLIENT_SECRET ?? "",
      redirect_uri: zidRedirectUri(),
    }),
  });
  if (!res.ok) {
    console.error(`❌ فشل تجديد رمز زد (${res.status}):`, await res.text());
    throw new Error("فشل تجديد رمز زد");
  }
  return res.json();
}

async function fetchStoreProfile(bundle: ZidTokenBundle): Promise<{ storeId: string }> {
  const res = await fetch(`${ZID_API_BASE}/managers/account/profile`, {
    headers: { Authorization: `Bearer ${bundle.authorization}`, "X-Manager-Token": bundle.accessToken },
  });
  if (!res.ok) throw new Error(`فشل جلب بيانات متجر زد: ${res.status}`);
  const data = await res.json();
  return { storeId: String(data?.store?.id ?? "") };
}

/** يعيد حزمة توكنز صالحة للاستخدام — يجدّدها تلقائياً إن انتهت صلاحيتها (بفارق أمان 5 دقائق). */
async function getValidTokenBundle(tenantId: string): Promise<ZidTokenBundle> {
  const integration = await withTenant(tenantId, (tx) =>
    tx.integration.findUniqueOrThrow({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } } })
  );
  if (!integration.encryptedAccessToken) throw new Error("لا يوجد اتصال زد حقيقي فعّال لهذا التاجر.");

  const bundle = decryptZidTokenBundle(integration.encryptedAccessToken);
  const expiresSoon = integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (!expiresSoon || !integration.encryptedRefreshToken) return bundle;

  const refreshed = await refreshTokens(decryptSecret(integration.encryptedRefreshToken));
  const newBundle: ZidTokenBundle = { authorization: refreshed.authorization, accessToken: refreshed.access_token };
  await withTenant(tenantId, (tx) =>
    tx.integration.update({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
      data: {
        encryptedAccessToken: encryptZidTokenBundle(newBundle),
        encryptedRefreshToken: encryptSecret(refreshed.refresh_token),
        tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    })
  );
  return newBundle;
}

export const zidAdapter: IntegrationAdapter = {
  provider: IntegrationProvider.ZID,

  getAuthorizationUrl(tenantId: string, state?: string): string {
    if (!hasRealZidCredentials()) return `/dashboard/integrations?sandbox_connect=ZID&tenant=${tenantId}`;
    const params = new URLSearchParams({
      client_id: process.env.ZID_CLIENT_ID ?? "", response_type: "code", redirect_uri: zidRedirectUri(),
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

    // وضع Live: تبادل حقيقي فعلي لرمز OAuth ببيانات اعتماد التطبيق الحقيقية.
    const tokens = await exchangeCodeForTokens(code);
    const bundle: ZidTokenBundle = { authorization: tokens.authorization, accessToken: tokens.access_token };
    const { storeId } = await fetchStoreProfile(bundle);

    await withTenant(tenantId, async (tx) => {
      await tx.integration.upsert({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
        update: {
          status: "CONNECTED", isSandbox: false, externalAccountId: storeId,
          encryptedAccessToken: encryptZidTokenBundle(bundle), encryptedRefreshToken: encryptSecret(tokens.refresh_token),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000), lastSyncedAt: new Date(), lastError: null,
        },
        create: {
          tenantId, provider: IntegrationProvider.ZID, status: "CONNECTED", isSandbox: false, externalAccountId: storeId,
          encryptedAccessToken: encryptZidTokenBundle(bundle), encryptedRefreshToken: encryptSecret(tokens.refresh_token),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000), lastSyncedAt: new Date(),
        },
      });
    });
    return { externalAccountId: storeId };
  },

  async syncOrders(tenantId: string): Promise<SyncResult> {
    if (!hasRealZidCredentials()) {
      let ordersSynced = 0;
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
        await tx.integration.update({
          where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
          data: { lastSyncedAt: new Date() },
        });
      });
      return { ordersSynced, productsSynced: 0 };
    }

    // وضع Live: جلب حقيقي مُرقَّم الصفحات من REST API الحقيقي لزد.
    const bundle = await getValidTokenBundle(tenantId);
    const headers = { Authorization: `Bearer ${bundle.authorization}`, "X-Manager-Token": bundle.accessToken };

    let ordersSynced = 0;
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(`${ZID_API_BASE}/managers/store/orders?page=${page}&per_page=50`, { headers });
      if (!res.ok) throw new Error(`فشل جلب طلبات زد: ${res.status}`);
      const data = await res.json();
      const orders: Array<Record<string, unknown>> = data?.orders ?? [];
      if (orders.length === 0) break;

      await withTenant(tenantId, async (tx) => {
        for (const order of orders) {
          const customer = order.customer as { name?: string; mobile?: string } | undefined;
          const rawMobile = customer?.mobile ? String(customer.mobile) : null;
          const phoneE164 = rawMobile ? (rawMobile.startsWith("+") ? rawMobile : `+${rawMobile}`) : null;
          if (!phoneE164) continue; // لا هاتف حقيقي مرتبط بالطلب — لا يمكن ربطه بجهة اتصال واتساب

          const contact = await tx.contact.upsert({
            where: { tenantId_phoneE164: { tenantId, phoneE164 } },
            update: {},
            create: { tenantId, name: customer?.name ?? phoneE164, phoneE164, stage: "CUSTOMER", externalZidId: String(order.id), source: "ZID_SYNC" },
          });

          const statusCode = (order.order_status as { code?: string } | undefined)?.code ?? "new";
          const totalSar = Math.round(parseFloat(String((order.order_total as string | number | undefined) ?? "0")));

          await tx.order.upsert({
            where: { tenantId_externalSource_externalId: { tenantId, externalSource: "ZID", externalId: String(order.id) } },
            update: { status: mapZidOrderStatus(statusCode), totalSar },
            create: {
              tenantId, contactId: contact.id, externalSource: "ZID", externalId: String(order.id),
              status: mapZidOrderStatus(statusCode), totalSar,
            },
          });
          ordersSynced++;
        }
      });

      if (!data?.pagination?.next && orders.length < 50) break;
      page++;
      if (page > 200) break; // حد أمان يمنع حلقة لا نهائية عند استجابة غير متوقَّعة من الـAPI
    }

    let productsSynced = 0;
    let productPage = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(`${ZID_API_BASE}/products/?page=${productPage}&page_size=50`, { headers });
      if (!res.ok) break; // فشل مزامنة المنتجات لا يوقف مزامنة الطلبات (أهم بيانياً) — يُسجَّل ضمنياً بانتهاء الحلقة
      const data = await res.json();
      const products: Array<Record<string, unknown>> = data?.results ?? data?.products ?? [];
      if (products.length === 0) break;

      await withTenant(tenantId, async (tx) => {
        for (const product of products) {
          const name = typeof product.name === "object" ? (product.name as Record<string, string>)?.ar ?? (product.name as Record<string, string>)?.en : String(product.name ?? "");
          await tx.product.upsert({
            where: { tenantId_externalSource_externalId: { tenantId, externalSource: "ZID", externalId: String(product.id) } },
            update: { name: name || "منتج بلا اسم", priceSar: Math.round(Number(product.price ?? 0)), stockQty: Number(product.quantity ?? 0) },
            create: {
              tenantId, externalSource: "ZID", externalId: String(product.id),
              name: name || "منتج بلا اسم", priceSar: Math.round(Number(product.price ?? 0)), stockQty: Number(product.quantity ?? 0),
            },
          });
          productsSynced++;
        }
      });

      productPage++;
      if (productPage > 200) break;
    }

    await withTenant(tenantId, (tx) =>
      tx.integration.update({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } }, data: { lastSyncedAt: new Date(), lastError: null } })
    );

    return { ordersSynced, productsSynced };
  },

  async sendMessage(): Promise<SendMessageResult> {
    throw new Error("Zid adapter does not send WhatsApp messages directly — use metaAdapter.sendMessage().");
  },

  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    // ملاحظة صادقة: توثيق زد الرسمي (docs.zid.sa) لا يوضّح صراحة آلية توقيع الـWebhook أو اسم الترويسة
    // المستخدَمة (بخلاف سلة، الموثَّقة بوضوح كـX-Salla-Signature) — هذا التحقق مبني على النمط القياسي
    // الشائع (HMAC-SHA256 بترويسة x-zid-signature) وقد يحتاج تعديلاً فعلياً بعد ربط حساب حقيقي
    // ومراجعة لوحة تطبيقات زد لمعرفة الترويسة الصحيحة فعلياً. راجع DECISIONS.md.
    const secret = process.env.ZID_WEBHOOK_SECRET;
    if (!signatureHeader || !secret) return false;
    return verifyHmacSignature(rawBody, signatureHeader, secret);
  },

  async disconnect(tenantId: string) {
    await withTenant(tenantId, async (tx) => {
      await tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
        data: { status: "DISCONNECTED", encryptedAccessToken: null, encryptedRefreshToken: null },
      });
    });
  },
};

function mapZidOrderStatus(zidStatusCode: string): "ABANDONED_CART" | "PENDING" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED" {
  switch (zidStatusCode) {
    case "new": return "PENDING";
    case "preparing": return "PAID";
    case "ready": return "PAID";
    case "indelivery": return "SHIPPED";
    case "delivered": return "DELIVERED";
    case "cancelled": return "CANCELLED";
    default: return "PENDING";
  }
}
