import { IntegrationProvider } from "@prisma/client";
import { superAdminDb, withTenant } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { redisConnection } from "@/lib/queue/connection";

// قابلتان للتغيير عبر البيئة لأغراض الاختبار المحلي فقط (خادم سلة وهمي) — الافتراضي خوادم سلة الحقيقية.
export const SALLA_OAUTH_BASE = process.env.SALLA_OAUTH_BASE_URL || "https://accounts.salla.sa/oauth2";
export const SALLA_API_BASE = process.env.SALLA_API_BASE_URL || "https://api.salla.dev/admin/v2";

/** رابط تثبيت التطبيق من متجر تطبيقات سلة (النمط السهل) — متاح فقط عند ضبط رقم التطبيق. */
export function sallaInstallUrl(): string | null {
  const appId = process.env.SALLA_APP_ID?.trim();
  return appId ? `https://s.salla.sa/apps/install/${encodeURIComponent(appId)}` : null;
}

export type SallaTokens = { accessToken: string; refreshToken: string; expiresAt: Date; scope?: string };

/**
 * حقل `expires` في حدث app.store.authorize موثَّق كـ Unix timestamp بالثواني، لكن أمثلة سلة نفسها
 * تُظهر أحياناً مدة (1209599 ثانية = أسبوعان) — أي قيمة أصغر من مليار تُعامَل كمدة من الآن.
 */
export function parseSallaExpires(expires: unknown): Date {
  const n = Number(expires);
  if (!Number.isFinite(n) || n <= 0) return new Date(Date.now() + 14 * 24 * 3600 * 1000);
  return n > 1_000_000_000 ? new Date(n * 1000) : new Date(Date.now() + n * 1000);
}

export type SallaStoreInfo = {
  merchantId: string;
  storeName: string | null;
  storeDomain: string | null;
  ownerName: string | null;
  email: string | null;
  mobile: string | null;
};

export async function fetchSallaUserInfo(accessToken: string): Promise<SallaStoreInfo> {
  const res = await fetch(`${SALLA_OAUTH_BASE}/user/info`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`فشل جلب بيانات متجر سلة (${res.status})`);
  const body = await res.json();
  const data = body?.data ?? body;
  const merchant = data?.merchant ?? {};
  return {
    merchantId: String(merchant.id ?? data?.merchant_id ?? ""),
    storeName: merchant.name ?? null,
    storeDomain: merchant.domain ?? null,
    ownerName: data?.name ?? null,
    email: typeof data?.email === "string" ? data.email.toLowerCase().trim() : null,
    mobile: data?.mobile != null ? String(data.mobile) : null,
  };
}

/** حفظ رموز سلة مشفَّرة على تكامل التاجر — يُستخدم من حدث التفويض ومن التجديد على حد سواء. */
export async function saveSallaTokens(tenantId: string, tokens: SallaTokens) {
  await withTenant(tenantId, (tx) =>
    tx.integration.update({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
      data: {
        encryptedAccessToken: encryptSecret(tokens.accessToken),
        encryptedRefreshToken: encryptSecret(tokens.refreshToken),
        tokenExpiresAt: tokens.expiresAt,
        status: "CONNECTED",
        lastError: null,
      },
    })
  );
}

async function requestRefresh(refreshToken: string): Promise<SallaTokens> {
  const res = await fetch(`${SALLA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token", refresh_token: refreshToken,
      client_id: process.env.SALLA_CLIENT_ID ?? "", client_secret: process.env.SALLA_CLIENT_SECRET ?? "",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.error(`❌ فشل تجديد رمز سلة (${res.status}):`, await res.text());
    throw new Error("فشل تجديد رمز سلة");
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: parseSallaExpires(data.expires_in ?? data.expires),
    scope: data.scope,
  };
}

const REFRESH_LOCK_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * يعيد access token صالحاً، ويجدّده عند اقتراب انتهائه (أقل من يوم). رمز التجديد في سلة **صالح لمرة
 * واحدة فقط**: تجديدان متزامنان يُبطلان الرمزين معاً ويُجبران التاجر على إعادة تثبيت التطبيق (موثَّق في
 * docs.salla.dev) — لذلك التجديد محمي بقفل Redis لكل تاجر، ومن لا يحصل على القفل ينتظر الرمز الجديد.
 */
export async function getValidSallaAccessToken(tenantId: string): Promise<string> {
  const readIntegration = () =>
    withTenant(tenantId, (tx) =>
      tx.integration.findUniqueOrThrow({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } })
    );

  let integration = await readIntegration();
  if (!integration.encryptedAccessToken || integration.status === "DISCONNECTED") {
    throw new Error("لا يوجد اتصال سلة فعّال لهذا التاجر.");
  }
  const needsRefresh = (expiresAt: Date | null) => !!expiresAt && expiresAt.getTime() - Date.now() < 24 * 3600 * 1000;
  if (!needsRefresh(integration.tokenExpiresAt) || !integration.encryptedRefreshToken) {
    return decryptSecret(integration.encryptedAccessToken);
  }

  const lockKey = `salla:refresh-lock:${tenantId}`;
  const acquired = await redisConnection.set(lockKey, "1", "PX", REFRESH_LOCK_MS, "NX");
  if (!acquired) {
    // عملية أخرى تجدّد الآن — ننتظر حتى يُحفظ الرمز الجديد بدل تجديد ثانٍ يُبطل الاثنين.
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      integration = await readIntegration();
      if (!needsRefresh(integration.tokenExpiresAt) && integration.encryptedAccessToken) {
        return decryptSecret(integration.encryptedAccessToken);
      }
    }
    throw new Error("انتهت مهلة انتظار تجديد رمز سلة.");
  }

  try {
    // إعادة القراءة بعد الحصول على القفل: ربما جدّدت عملية أخرى قبلنا مباشرة.
    integration = await readIntegration();
    if (!needsRefresh(integration.tokenExpiresAt) && integration.encryptedAccessToken) {
      return decryptSecret(integration.encryptedAccessToken);
    }
    const refreshed = await requestRefresh(decryptSecret(integration.encryptedRefreshToken!));
    await saveSallaTokens(tenantId, refreshed);
    return refreshed.accessToken;
  } catch (err) {
    await withTenant(tenantId, (tx) =>
      tx.integration.update({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
        data: { status: "NEEDS_REAUTH", lastError: "تعذّر تجديد رمز سلة — أعد تثبيت التطبيق من متجر سلة." },
      })
    );
    throw err;
  } finally {
    await redisConnection.del(lockKey);
  }
}

/** طلب GET مصادَق على Admin API لسلة مع تجديد تلقائي للرمز. */
export async function sallaGet<T = any>(tenantId: string, path: string): Promise<T> {
  const token = await getValidSallaAccessToken(tenantId);
  const res = await fetch(`${SALLA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401) {
    await superAdminDb.integration.updateMany({
      where: { tenantId, provider: IntegrationProvider.SALLA },
      data: { status: "NEEDS_REAUTH", lastError: "رفضت سلة رمز الوصول — أعد تثبيت التطبيق من متجر سلة." },
    });
  }
  if (!res.ok) throw new Error(`فشل طلب سلة ${path} (${res.status})`);
  return res.json();
}
