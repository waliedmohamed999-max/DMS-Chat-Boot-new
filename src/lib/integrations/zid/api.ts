import crypto from "crypto";
import { IntegrationProvider } from "@prisma/client";
import { superAdminDb, withTenant } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { redisConnection } from "@/lib/queue/connection";
import { getZidConfig } from "./config";

/**
 * عميل Zid API (docs.zid.sa/authorization):
 *  - OAuth: oauth.zid.sa/oauth/authorize ← /oauth/token (authorization_code / refresh_token).
 *  - كل طلب يحمل رمزين: `Authorization: Bearer <authorization>` (التطبيق) و`X-Manager-Token: <access_token>` (المتجر).
 *  - تجديد الرمز يُبطل refresh_token القديم فوراً ⇒ قفل Redis يمنع تجديدين متزامنين لنفس المتجر.
 * العناوين قابلة للتغيير عبر البيئة للاختبار المحلي فقط (خادم وهمي).
 */
export const ZID_OAUTH_BASE = (process.env.ZID_OAUTH_BASE_URL || "https://oauth.zid.sa/oauth").replace(/\/$/, "");
export const ZID_API_BASE = (process.env.ZID_API_BASE_URL || "https://api.zid.sa/v1").replace(/\/$/, "");

export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** رابط إعادة التوجيه الوحيد المسجَّل في لوحة شركاء زد — لمساري التثبيت من المتجر والربط من لوحة DMS معاً. */
export function zidRedirectUri(): string {
  return `${appBaseUrl()}/api/zid/oauth/callback`;
}

export type ZidTokenBundle = { authorization: string; accessToken: string };
export type ZidTokenResponse = { access_token: string; authorization: string; refresh_token: string; expires_in: number };

/** الرمزان يُخزَّنان معاً كـJSON مشفَّر في encryptedAccessToken (نفس الصيغة السابقة — توافق مع الربط القديم). */
export function encryptZidTokenBundle(bundle: ZidTokenBundle): string {
  return encryptSecret(JSON.stringify(bundle));
}

export function decryptZidTokenBundle(ciphertext: string): ZidTokenBundle {
  return JSON.parse(decryptSecret(ciphertext)) as ZidTokenBundle;
}

export async function zidAuthorizeUrl(state: string): Promise<string> {
  const { clientId } = await getZidConfig();
  if (!clientId) throw new Error("تطبيق زد غير مضبوط (Client ID) — اضبطه من لوحة الأدمن ← تطبيق زد");
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: zidRedirectUri(), response_type: "code", state });
  return `${ZID_OAUTH_BASE}/authorize?${params.toString()}`;
}

async function tokenRequest(params: Record<string, string>): Promise<ZidTokenResponse> {
  const { clientId, clientSecret } = await getZidConfig();
  if (!clientId || !clientSecret) throw new Error("تطبيق زد غير مضبوط (Client ID / Client Secret)");
  const res = await fetch(`${ZID_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret, redirect_uri: zidRedirectUri() }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    // جسم الرد يُسجَّل في الخادم فقط — لا يصل لرابط إعادة توجيه مرئي للمتصفح.
    console.error(`❌ Zid OAuth ${params.grant_type} (${res.status}):`, (await res.text()).slice(0, 500));
    throw new Error(params.grant_type === "refresh_token" ? "فشل تجديد رمز زد" : "فشل تبادل رمز OAuth مع زد");
  }
  const body = await res.json();
  if (!body?.access_token || !body?.authorization) throw new Error("رد OAuth من زد بلا رموز وصول");
  return body as ZidTokenResponse;
}

export function exchangeZidCode(code: string): Promise<ZidTokenResponse> {
  return tokenRequest({ grant_type: "authorization_code", code });
}

export function tokenFieldsFrom(tokens: ZidTokenResponse) {
  return {
    encryptedAccessToken: encryptZidTokenBundle({ authorization: tokens.authorization, accessToken: tokens.access_token }),
    encryptedRefreshToken: encryptSecret(tokens.refresh_token),
    tokenExpiresAt: new Date(Date.now() + (Number(tokens.expires_in) || 365 * 24 * 3600) * 1000),
  };
}

export type ZidStoreProfile = {
  storeId: string;
  storeUuid: string | null;
  storeName: string | null;
  storeUrl: string | null;
  email: string | null;
  mobile: string | null;
  ownerName: string | null;
};

function headersFor(bundle: ZidTokenBundle, storeId?: string | null): Record<string, string> {
  return {
    Authorization: `Bearer ${bundle.authorization}`,
    "X-Manager-Token": bundle.accessToken,
    Accept: "application/json",
    "Accept-Language": "ar",
    // واجهات المنتجات تتطلب معرّف المتجر ودور المدير صراحة.
    ...(storeId ? { "Store-Id": storeId, Role: "Manager" } : {}),
  };
}

/** بيانات المتجر وصاحبه بعد التفويض — الحقول تختلف بين إصدارات الـAPI، فالاستخراج دفاعي. */
export async function fetchZidProfile(bundle: ZidTokenBundle): Promise<ZidStoreProfile> {
  const res = await fetch(`${ZID_API_BASE}/managers/account/profile`, { headers: headersFor(bundle), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`فشل جلب بيانات متجر زد (${res.status})`);
  const data = await res.json();
  const user = data?.user ?? data;
  const store = user?.store ?? data?.store ?? {};
  const storeId = store?.id ?? data?.store_id;
  if (storeId == null) throw new Error("رد زد بلا معرّف متجر");
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
  return {
    storeId: String(storeId),
    storeUuid: str(store?.uuid),
    storeName: str(store?.title) ?? str(store?.name),
    storeUrl: str(store?.url) ?? str(store?.domain),
    email: (str(user?.email) ?? str(store?.email))?.toLowerCase() ?? null,
    mobile: str(user?.mobile) ?? str(store?.phone),
    ownerName: str(user?.name),
  };
}

const LOCK_TTL_MS = 30_000;
/** refresh_token في زد صالح سنة من إصداره (رمز الوصول 3 سنوات) — يُجدَّد استباقياً بعد 300 يوم. */
const REFRESH_TOKEN_RENEW_AFTER_MS = 300 * 24 * 3600 * 1000;

function metaOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** وقت إصدار الرموز الحالية: آخر تجديد، أو آخر تفويض/تثبيت. */
export function zidTokensIssuedAt(metadataJson: unknown): Date | null {
  const m = metaOf(metadataJson);
  const raw = (m.tokensIssuedAt ?? m.reauthorizedAt ?? m.installedAt) as string | undefined;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function refreshTokenAging(metadataJson: unknown): boolean {
  const issued = zidTokensIssuedAt(metadataJson);
  return !!issued && Date.now() - issued.getTime() > REFRESH_TOKEN_RENEW_AFTER_MS;
}

/** حزمة رموز صالحة للمتجر — تُجدَّد تلقائياً قبل انتهائها بيوم (تحت قفل؛ refresh_token يُستخدم مرة واحدة). */
export async function getValidZidBundle(tenantId: string): Promise<{ bundle: ZidTokenBundle; storeId: string | null }> {
  const load = () =>
    withTenant(tenantId, (tx) => tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } } }));
  let integration = await load();
  if (!integration?.encryptedAccessToken) throw new Error("لا يوجد ربط زد فعّال لهذا التاجر");
  const fresh = (!integration.tokenExpiresAt || integration.tokenExpiresAt.getTime() - Date.now() > 24 * 3600 * 1000) && !refreshTokenAging(integration.metadataJson);
  if (fresh || !integration.encryptedRefreshToken) return { bundle: decryptZidTokenBundle(integration.encryptedAccessToken), storeId: integration.externalAccountId };

  const lockKey = `zid-refresh:${tenantId}`;
  const owner = crypto.randomUUID();
  const locked = await redisConnection.set(lockKey, owner, "PX", LOCK_TTL_MS, "NX");
  if (locked !== "OK") {
    // عملية أخرى تجدّد الآن — ننتظر ثم نقرأ الرموز الجديدة.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      integration = await load();
      if (integration?.tokenExpiresAt && integration.tokenExpiresAt.getTime() - Date.now() > 24 * 3600 * 1000) break;
    }
    if (!integration?.encryptedAccessToken) throw new Error("لا يوجد ربط زد فعّال لهذا التاجر");
    return { bundle: decryptZidTokenBundle(integration.encryptedAccessToken), storeId: integration.externalAccountId };
  }
  try {
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: decryptSecret(integration.encryptedRefreshToken) });
    await withTenant(tenantId, (tx) =>
      tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
        data: { ...tokenFieldsFrom(tokens), lastError: null, metadataJson: { ...metaOf(integration!.metadataJson), tokensIssuedAt: new Date().toISOString() } },
      })
    );
    return { bundle: { authorization: tokens.authorization, accessToken: tokens.access_token }, storeId: integration.externalAccountId };
  } catch (err) {
    await withTenant(tenantId, (tx) =>
      tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
        data: { status: "NEEDS_REAUTH", lastError: "انتهت صلاحية ربط زد — افتح التطبيق من لوحة زد لإعادة التفويض" },
      })
    ).catch(() => {});
    throw err;
  } finally {
    if ((await redisConnection.get(lockKey)) === owner) await redisConnection.del(lockKey);
  }
}

/** طلب GET على Zid API باسم المتجر. 401 ⇒ الربط يحتاج إعادة تفويض (الحالة تظهر للتاجر والأدمن). */
export async function zidGet<T = any>(tenantId: string, path: string, opts?: { storeHeaders?: boolean }): Promise<T> {
  const { bundle, storeId } = await getValidZidBundle(tenantId);
  const res = await fetch(`${ZID_API_BASE}${path}`, { headers: headersFor(bundle, opts?.storeHeaders ? storeId : null), signal: AbortSignal.timeout(30_000) });
  if (res.status === 401) {
    await withTenant(tenantId, (tx) =>
      tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
        data: { status: "NEEDS_REAUTH", lastError: "رفضت زد رموز الوصول — افتح التطبيق من لوحة زد لإعادة التفويض" },
      })
    ).catch(() => {});
    throw new Error("رفضت زد رموز الوصول (401)");
  }
  if (!res.ok) throw new Error(`فشل طلب زد ${path.split("?")[0]} (${res.status})`);
  return res.json() as Promise<T>;
}

/** أحداث المتجر التي نشترك بها (docs.zid.sa/webhooks) — كل حدث باشتراك مستقل والحدث في رابط الاستقبال نفسه. */
export const ZID_STORE_EVENTS = [
  "order.create", "order.status.update", "order.payment_status.update",
  "abandoned_cart.created", "abandoned_cart.completed",
  "customer.create", "customer.update", "customer.merchant.update",
  "product.create", "product.update", "product.publish", "product.delete",
] as const;

export function zidWebhookTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * يشترك في أحداث المتجر (POST /managers/webhooks). المصادقة: Basic Auth يرسلها زد مع كل حدث —
 * اسم المستخدم = رقم المتجر، كلمة المرور = رمز عشوائي خاص بهذا المتجر (نخزّن بصمته فقط). اشتراكات
 * سابقة لنفس التطبيق تُحذف أولاً (إعادة التثبيت/إعادة التفويض) لتفادي التكرار. يعيد عدد الاشتراكات الناجحة.
 */
export async function registerZidWebhooks(tenantId: string): Promise<{ created: number; failed: string[] }> {
  const { appId } = await getZidConfig();
  const { bundle, storeId } = await getValidZidBundle(tenantId);
  if (!storeId) throw new Error("ربط زد بلا رقم متجر");
  const base = appBaseUrl();
  const headers = { ...headersFor(bundle), "Content-Type": "application/json" };

  // حذف اشتراكاتنا السابقة (best-effort — الواجهة قد لا تتيح القائمة بكل الصلاحيات).
  try {
    const list = await fetch(`${ZID_API_BASE}/managers/webhooks`, { headers, signal: AbortSignal.timeout(15_000) });
    if (list.ok) {
      const body = await list.json();
      const items: Array<Record<string, any>> = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
      for (const w of items) {
        if (typeof w?.target_url === "string" && w.target_url.startsWith(`${base}/api/webhooks/zid`) && w.id) {
          await fetch(`${ZID_API_BASE}/managers/webhooks/${encodeURIComponent(String(w.id))}`, { method: "DELETE", headers, signal: AbortSignal.timeout(15_000) }).catch(() => {});
        }
      }
    }
  } catch {
    // تجاهل — الاشتراكات القديمة برمز قديم تُرفض عندنا على أي حال
  }

  const token = crypto.randomBytes(24).toString("hex");
  await withTenant(tenantId, (tx) =>
    tx.integration.update({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
      data: { webhookTokenHash: zidWebhookTokenHash(token), webhookSubscribed: false },
    })
  );

  let created = 0;
  const failed: string[] = [];
  for (const event of ZID_STORE_EVENTS) {
    const res = await fetch(`${ZID_API_BASE}/managers/webhooks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event,
        target_url: `${base}/api/webhooks/zid?event=${encodeURIComponent(event)}`,
        original_id: appId ?? "dms",
        conditions: {},
        username: storeId,
        password: token,
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (res?.ok) created++;
    else failed.push(event);
  }
  await withTenant(tenantId, (tx) =>
    tx.integration.update({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
      data: { webhookSubscribed: created > 0, ...(failed.length ? { lastError: `تعذّر الاشتراك في أحداث زد: ${failed.join("، ")}` } : {}) },
    })
  );
  if (failed.length) console.error(`⚠️ اشتراكات زد فاشلة للمستأجر ${tenantId}:`, failed.join(", "));
  return { created, failed };
}

/** يطابق Basic Auth الوارد مع أحداث متجر زد ⇒ الربط المطابق (أو null). */
export async function findZidIntegrationByWebhookAuth(authorization: string | null) {
  const m = /^Basic\s+(.+)$/i.exec(authorization ?? "");
  if (!m) return null;
  const decoded = Buffer.from(m[1]!, "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep <= 0) return null;
  const storeId = decoded.slice(0, sep);
  const token = decoded.slice(sep + 1);
  if (!token) return null;
  const integration = await superAdminDb.integration.findFirst({ where: { provider: IntegrationProvider.ZID, webhookTokenHash: zidWebhookTokenHash(token) } });
  return integration && integration.externalAccountId === storeId ? integration : null;
}
