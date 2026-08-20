import { IntegrationProvider } from "@prisma/client";
import type { IntegrationAdapter, SendMessageResult, SyncResult } from "@/lib/integrations/types";
import { SANDBOX_SALLA_ORDERS, SANDBOX_SALLA_PRODUCTS, sandboxAccountIdFor } from "@/lib/integrations/fixtures";
import { encryptSecret, decryptSecret, verifyHmacSignature } from "@/lib/crypto";
import { withTenant } from "@/lib/db";

const SALLA_OAUTH_BASE = "https://accounts.salla.sa/oauth2";
const SALLA_API_BASE = "https://api.salla.dev/admin/v2";

/** مستقلة عن `PlatformSettings.integrationsMode` العام — نفس القرار وسببه الموثَّق في zid/adapter.ts. */
function hasRealSallaCredentials(): boolean {
  return Boolean(process.env.SALLA_CLIENT_ID && process.env.SALLA_CLIENT_SECRET);
}

function baseUrl(): string {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function sallaRedirectUri(): string {
  return `${baseUrl()}/api/integrations/salla/callback`;
}

type SallaTokenResponse = { access_token: string; refresh_token: string; expires_in: number };

async function exchangeCodeForTokens(code: string): Promise<SallaTokenResponse> {
  const res = await fetch(`${SALLA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code,
      client_id: process.env.SALLA_CLIENT_ID ?? "", client_secret: process.env.SALLA_CLIENT_SECRET ?? "",
      redirect_uri: sallaRedirectUri(),
    }),
  });
  if (!res.ok) {
    // جسم الاستجابة الخام لا يُدرَج في رسالة الخطأ المُلقاة (تصل مباشرة لعنوان إعادة توجيه مرئي
    // للمتصفح في route.ts) — قد يحمل تفاصيل تشخيصية من سلة غير مخصَّصة للعرض للعميل. يُسجَّل هنا
    // فقط في سجلات الخادم.
    console.error(`❌ فشل تبادل رمز OAuth مع سلة (${res.status}):`, await res.text());
    throw new Error("فشل تبادل رمز OAuth مع سلة");
  }
  return res.json();
}

async function refreshTokens(refreshToken: string): Promise<SallaTokenResponse> {
  const res = await fetch(`${SALLA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", refresh_token: refreshToken,
      client_id: process.env.SALLA_CLIENT_ID ?? "", client_secret: process.env.SALLA_CLIENT_SECRET ?? "",
    }),
  });
  if (!res.ok) {
    console.error(`❌ فشل تجديد رمز سلة (${res.status}):`, await res.text());
    throw new Error("فشل تجديد رمز سلة");
  }
  return res.json();
}

async function fetchMerchantInfo(accessToken: string): Promise<{ storeId: string }> {
  const res = await fetch(`${SALLA_OAUTH_BASE}/user/info`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`فشل جلب بيانات متجر سلة: ${res.status}`);
  const data = await res.json();
  return { storeId: String(data?.merchant?.id ?? data?.id ?? "") };
}

/** يعيد access token صالحاً للاستخدام — يجدّده تلقائياً إن انتهت صلاحيته (بفارق أمان 5 دقائق). رموز
 * سلة قصيرة العمر نسبياً (أسبوعان) فتجديدها أثناء المزامنة الدورية أمر متوقَّع ومتكرر، وليس استثناءً. */
async function getValidAccessToken(tenantId: string): Promise<string> {
  const integration = await withTenant(tenantId, (tx) =>
    tx.integration.findUniqueOrThrow({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } })
  );
  if (!integration.encryptedAccessToken) throw new Error("لا يوجد اتصال سلة حقيقي فعّال لهذا التاجر.");

  const expiresSoon = integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (!expiresSoon || !integration.encryptedRefreshToken) return decryptSecret(integration.encryptedAccessToken);

  const refreshed = await refreshTokens(decryptSecret(integration.encryptedRefreshToken));
  await withTenant(tenantId, (tx) =>
    tx.integration.update({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
      data: {
        encryptedAccessToken: encryptSecret(refreshed.access_token),
        encryptedRefreshToken: encryptSecret(refreshed.refresh_token),
        tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    })
  );
  return refreshed.access_token;
}

export const sallaAdapter: IntegrationAdapter = {
  provider: IntegrationProvider.SALLA,

  getAuthorizationUrl(tenantId: string, state?: string): string {
    if (!hasRealSallaCredentials()) return `/dashboard/integrations?sandbox_connect=SALLA&tenant=${tenantId}`;
    const params = new URLSearchParams({
      client_id: process.env.SALLA_CLIENT_ID ?? "", response_type: "code", redirect_uri: sallaRedirectUri(),
      scope: "offline_access orders.read products.read", ...(state ? { state } : {}),
    });
    return `${SALLA_OAUTH_BASE}/auth?${params.toString()}`;
  },

  async handleAuthorizationCallback(tenantId: string, code: string) {
    if (!hasRealSallaCredentials()) {
      const externalAccountId = sandboxAccountIdFor("salla");
      await withTenant(tenantId, async (tx) => {
        await tx.integration.upsert({
          where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
          update: {
            status: "CONNECTED", isSandbox: true, externalAccountId,
            encryptedAccessToken: encryptSecret("sandbox-salla-token"), lastSyncedAt: new Date(), lastError: null,
          },
          create: {
            tenantId, provider: IntegrationProvider.SALLA, status: "CONNECTED", isSandbox: true,
            externalAccountId, encryptedAccessToken: encryptSecret("sandbox-salla-token"), lastSyncedAt: new Date(),
          },
        });
      });
      return { externalAccountId };
    }

    // وضع Live: تبادل حقيقي فعلي لرمز OAuth ببيانات اعتماد التطبيق الحقيقية.
    const tokens = await exchangeCodeForTokens(code);
    const { storeId } = await fetchMerchantInfo(tokens.access_token);

    await withTenant(tenantId, async (tx) => {
      await tx.integration.upsert({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
        update: {
          status: "CONNECTED", isSandbox: false, externalAccountId: storeId,
          encryptedAccessToken: encryptSecret(tokens.access_token), encryptedRefreshToken: encryptSecret(tokens.refresh_token),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000), lastSyncedAt: new Date(), lastError: null,
        },
        create: {
          tenantId, provider: IntegrationProvider.SALLA, status: "CONNECTED", isSandbox: false, externalAccountId: storeId,
          encryptedAccessToken: encryptSecret(tokens.access_token), encryptedRefreshToken: encryptSecret(tokens.refresh_token),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000), lastSyncedAt: new Date(),
        },
      });
    });
    return { externalAccountId: storeId };
  },

  async syncOrders(tenantId: string): Promise<SyncResult> {
    if (!hasRealSallaCredentials()) {
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
            create: {
              tenantId, contactId: contact.id, externalSource: "SALLA", externalId: order.id,
              status: order.status as never, totalSar: order.total,
            },
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
    }

    // وضع Live: جلب حقيقي مُرقَّم الصفحات من REST API الحقيقي لسلة.
    const accessToken = await getValidAccessToken(tenantId);
    const headers = { Authorization: `Bearer ${accessToken}` };

    let ordersSynced = 0;
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(`${SALLA_API_BASE}/orders?page=${page}&per_page=30`, { headers });
      if (!res.ok) throw new Error(`فشل جلب طلبات سلة: ${res.status}`);
      const data = await res.json();
      const orders: Array<Record<string, unknown>> = data?.data ?? [];
      if (orders.length === 0) break;

      await withTenant(tenantId, async (tx) => {
        for (const order of orders) {
          const customer = order.customer as { first_name?: string; last_name?: string; mobile?: string | number } | undefined;
          const rawMobile = customer?.mobile ? String(customer.mobile) : null;
          const phoneE164 = rawMobile ? (rawMobile.startsWith("+") ? rawMobile : `+${rawMobile}`) : null;
          if (!phoneE164) continue; // لا هاتف حقيقي مرتبط بالطلب — لا يمكن ربطه بجهة اتصال واتساب

          const name = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || phoneE164;
          const contact = await tx.contact.upsert({
            where: { tenantId_phoneE164: { tenantId, phoneE164 } },
            update: {},
            create: { tenantId, name, phoneE164, stage: "CUSTOMER", externalSallaId: String(order.id), source: "SALLA_SYNC" },
          });

          const statusSlug = (order.status as { slug?: string } | undefined)?.slug ?? "under_review";
          const totalAmount = (order.total as { amount?: number } | undefined)?.amount ?? 0;

          await tx.order.upsert({
            where: { tenantId_externalSource_externalId: { tenantId, externalSource: "SALLA", externalId: String(order.id) } },
            update: { status: mapSallaOrderStatus(statusSlug), totalSar: Math.round(totalAmount) },
            create: {
              tenantId, contactId: contact.id, externalSource: "SALLA", externalId: String(order.id),
              status: mapSallaOrderStatus(statusSlug), totalSar: Math.round(totalAmount),
            },
          });
          ordersSynced++;
        }
      });

      if (!data?.pagination?.next) break;
      page++;
      if (page > 200) break; // حد أمان يمنع حلقة لا نهائية عند استجابة غير متوقَّعة من الـAPI
    }

    let productsSynced = 0;
    let productPage = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(`${SALLA_API_BASE}/products?page=${productPage}&per_page=30`, { headers });
      if (!res.ok) break; // فشل مزامنة المنتجات لا يوقف مزامنة الطلبات (أهم بيانياً)
      const data = await res.json();
      const products: Array<Record<string, unknown>> = data?.data ?? [];
      if (products.length === 0) break;

      await withTenant(tenantId, async (tx) => {
        for (const product of products) {
          const price = (product.price as { amount?: number } | undefined)?.amount ?? 0;
          // سلة تُعيد description كنص HTML مباشر — يُخزَّن كما هو (النموذج قادر على قراءة نص فيه
          // وسوم HTML بسيطة بلا مشكلة، لا داعي لتنظيفه الآن).
          const description = typeof product.description === "string" ? product.description : null;

          const categoriesRaw = product.categories;
          const categoryName =
            Array.isArray(categoriesRaw) && categoriesRaw.length > 0
              ? ((categoriesRaw[0] as Record<string, unknown>)?.name as string | undefined) ?? null
              : null;

          const imagesRaw = product.images;
          const imageUrl =
            Array.isArray(imagesRaw) && imagesRaw.length > 0
              ? ((imagesRaw[0] as Record<string, unknown>)?.url as string | undefined) ?? null
              : null;

          await tx.product.upsert({
            where: { tenantId_externalSource_externalId: { tenantId, externalSource: "SALLA", externalId: String(product.id) } },
            update: {
              name: String(product.name ?? "منتج بلا اسم"), priceSar: Math.round(price), stockQty: Number(product.quantity ?? 0),
              description, categoryName, imageUrl,
            },
            create: {
              tenantId, externalSource: "SALLA", externalId: String(product.id),
              name: String(product.name ?? "منتج بلا اسم"), priceSar: Math.round(price), stockQty: Number(product.quantity ?? 0),
              description, categoryName, imageUrl,
            },
          });
          productsSynced++;
        }
      });

      if (!data?.pagination?.next) break;
      productPage++;
      if (productPage > 200) break;
    }

    await withTenant(tenantId, (tx) =>
      tx.integration.update({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } }, data: { lastSyncedAt: new Date(), lastError: null } })
    );

    return { ordersSynced, productsSynced };
  },

  async sendMessage(): Promise<SendMessageResult> {
    throw new Error("Salla adapter does not send WhatsApp messages directly — use metaAdapter.sendMessage().");
  },

  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    // موثَّق رسمياً: X-Salla-Signature = HMAC-SHA256(rawBody, webhook secret) — راجع docs.salla.dev
    // (بخلاف زد، هذه الآلية مؤكَّدة من التوثيق الرسمي وليست تخميناً).
    const secret = process.env.SALLA_WEBHOOK_SECRET;
    if (!signatureHeader || !secret) return false;
    return verifyHmacSignature(rawBody, signatureHeader, secret);
  },

  async disconnect(tenantId: string) {
    await withTenant(tenantId, async (tx) => {
      await tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
        data: { status: "DISCONNECTED", encryptedAccessToken: null, encryptedRefreshToken: null },
      });
    });
  },
};

function mapSallaOrderStatus(slug: string): "ABANDONED_CART" | "PENDING" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED" {
  switch (slug) {
    case "under_review": return "PENDING";
    case "in_progress": return "PAID";
    case "completed": return "DELIVERED";
    case "delivering": return "SHIPPED";
    case "cancelled": return "CANCELLED";
    case "restoring": return "CANCELLED";
    default: return "PENDING";
  }
}
