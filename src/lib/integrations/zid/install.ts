import crypto from "crypto";
import bcrypt from "bcryptjs";
import { IntegrationProvider, Prisma } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { redisConnection } from "@/lib/queue/connection";
import { slugify } from "@/lib/slug";
import { getPlatformSettings } from "@/lib/platformSettings";
import { sendEmail } from "@/lib/email/send";
import { zidAccountCreatedEmail, zidStoreLinkedEmail } from "@/lib/email/zidTemplates";
import { exchangeZidCode, fetchZidProfile, registerZidWebhooks, tokenFieldsFrom, type ZidStoreProfile } from "./api";
import { startTrackedZidSync } from "./sync";

/**
 * تثبيت تطبيق DMS من متجر تطبيقات زد (OAuth — بخلاف سلة التي ترسل الرموز في webhook):
 *   رابط التطبيق (/api/zid/install) ← oauth.zid.sa/authorize ← /api/zid/oauth/callback ومعه code.
 * نفس الـcallback يخدم أيضاً "ربط زد" من لوحة DMS (state يحمل رقم الحساب). تحديد التاجر بالترتيب:
 *  1) متجر مربوط مسبقاً بنفس رقم المتجر ⇒ تحديث الرموز (إعادة فتح التطبيق/إعادة التفويض).
 *  2) ربط من لوحة DMS ⇒ الحساب المسجَّل دخوله (state).
 *  3) مالك حساب DMS بنفس بريد المتجر ⇒ ربط تلقائي + إشعار.
 *  4) لا حساب ⇒ حساب جديد (بانتظار المراجعة) + رابط تحديد كلمة المرور على بريد المتجر.
 * بعد الربط: اشتراك أحداث المتجر + مزامنة أولى بالخلفية.
 */

export type ZidOAuthState = { mode: "market" } | { mode: "dashboard"; tenantId: string; userId: string };
const STATE_TTL_SECONDS = 10 * 60;
const stateKey = (s: string) => `zid-oauth-state:${s}`;

export async function createZidOAuthState(payload: ZidOAuthState): Promise<string> {
  const state = crypto.randomBytes(24).toString("hex");
  await redisConnection.set(stateKey(state), JSON.stringify(payload), "EX", STATE_TTL_SECONDS);
  return state;
}

/** استهلاك لمرة واحدة (GETDEL) — state مُعاد استخدامه أو مزوَّر ⇒ null. */
export async function consumeZidOAuthState(state: string | null): Promise<ZidOAuthState | null> {
  if (!state || !/^[a-f0-9]{48}$/.test(state)) return null;
  const raw = await redisConnection.getdel(stateKey(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ZidOAuthState;
  } catch {
    return null;
  }
}

export type ZidInstallResult =
  | { outcome: "refreshed" | "linked_dashboard" | "linked_existing" | "created_account"; tenantId: string; storeId: string }
  | { outcome: "conflict"; reason: string };

function mergeMeta(current: Prisma.JsonValue | null | undefined, patch: Record<string, unknown>): Prisma.InputJsonValue {
  const base = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

function storeMeta(p: ZidStoreProfile) {
  return { storeId: p.storeId, storeUuid: p.storeUuid, storeName: p.storeName, storeDomain: p.storeUrl, storeEmail: p.email };
}

export async function handleZidOAuthCallback(code: string, state: ZidOAuthState): Promise<ZidInstallResult> {
  const tokens = await exchangeZidCode(code);
  const profile = await fetchZidProfile({ authorization: tokens.authorization, accessToken: tokens.access_token });
  const tokenData = { ...tokenFieldsFrom(tokens), status: "CONNECTED" as const, isSandbox: false as const, externalAccountId: profile.storeId, lastError: null };
  const storeName = profile.storeName ?? `متجر زد ${profile.storeId}`;

  const result = await linkStore(profile, storeName, tokenData, state);
  if (result.outcome !== "conflict") {
    // اشتراك الأحداث والمزامنة بالخلفية — رد الـcallback (تحويل المتصفح) لا ينتظر عشرات الطلبات.
    void registerZidWebhooks(result.tenantId)
      .catch((err) => console.error("❌ تعذّر الاشتراك في أحداث زد:", err instanceof Error ? err.message : err))
      .finally(() => startTrackedZidSync(result.tenantId, "install").catch(() => {}));
  }
  return result;
}

type TokenData = ReturnType<typeof tokenFieldsFrom> & { status: "CONNECTED"; isSandbox: false; externalAccountId: string; lastError: null };

async function linkStore(profile: ZidStoreProfile, storeName: string, tokenData: TokenData, state: ZidOAuthState): Promise<ZidInstallResult> {
  const storeId = profile.storeId;

  // (1) متجر مربوط مسبقاً
  const existing = await superAdminDb.integration.findFirst({ where: { provider: IntegrationProvider.ZID, externalAccountId: storeId, isSandbox: false } });
  if (existing) {
    if (state.mode === "dashboard" && state.tenantId !== existing.tenantId) {
      return { outcome: "conflict", reason: "هذا المتجر على زد مربوط بحساب DMS آخر" };
    }
    await superAdminDb.integration.update({
      where: { id: existing.id },
      data: { ...tokenData, metadataJson: mergeMeta(existing.metadataJson, { ...storeMeta(profile), reauthorizedAt: new Date().toISOString() }) },
    });
    return { outcome: "refreshed", tenantId: existing.tenantId, storeId };
  }

  // (2) ربط من لوحة DMS لحساب مسجَّل دخوله
  if (state.mode === "dashboard") {
    const tenantId = state.tenantId;
    const current = await superAdminDb.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } } });
    if (current && !current.isSandbox && current.status === "CONNECTED" && current.externalAccountId && current.externalAccountId !== storeId) {
      return { outcome: "conflict", reason: `حسابك مربوط مسبقاً بمتجر زد آخر (${current.externalAccountId}) — افصله أولاً` };
    }
    await upsertZid(tenantId, tokenData, { ...storeMeta(profile), linkMethod: "dashboard", installedAt: new Date().toISOString() });
    await superAdminDb.auditLog.create({ data: { tenantId, userId: state.userId, action: "integration.connect_live", targetType: "Integration", targetId: "ZID", metaJson: { storeId, storeName } } });
    return { outcome: "linked_dashboard", tenantId, storeId };
  }

  if (!profile.email) return { outcome: "conflict", reason: "لم ترسل زد بريداً لصاحب المتجر — اربط المتجر من لوحة DMS (التكاملات ← زد)" };
  const user = await superAdminDb.user.findUnique({ where: { email: profile.email } });

  // (3) مالك حساب قائم بنفس البريد
  if (user) {
    if (user.role !== "OWNER" || !user.tenantId) {
      return { outcome: "conflict", reason: `البريد ${profile.email} مسجَّل لحساب ليس مالك متجر — سجّل دخولك واربط زد من لوحة DMS` };
    }
    const tenantId = user.tenantId;
    const current = await superAdminDb.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } } });
    if (current && !current.isSandbox && current.status === "CONNECTED" && current.externalAccountId && current.externalAccountId !== storeId) {
      return { outcome: "conflict", reason: `حساب ${profile.email} مربوط مسبقاً بمتجر زد آخر (${current.externalAccountId})` };
    }
    await upsertZid(tenantId, tokenData, { ...storeMeta(profile), linkMethod: "email_match", installedAt: new Date().toISOString() });
    await superAdminDb.auditLog.create({ data: { tenantId, action: "integration.zid_linked_by_email", targetType: "Integration", targetId: "ZID", metaJson: { storeId, storeName } } });
    await sendEmail(zidStoreLinkedEmail({ to: user.email, ownerName: user.name, storeName })).catch((err) => console.error("zid linked email failed:", err));
    return { outcome: "linked_existing", tenantId, storeId };
  }

  // (4) حساب جديد
  const tenantId = await createTenantFromZid(profile, storeName, tokenData);
  return { outcome: "created_account", tenantId, storeId };
}

async function upsertZid(tenantId: string, tokenData: TokenData, meta: Record<string, unknown>) {
  const current = await superAdminDb.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } } });
  await superAdminDb.integration.upsert({
    where: { tenantId_provider: { tenantId, provider: IntegrationProvider.ZID } },
    update: { ...tokenData, metadataJson: mergeMeta(current?.metadataJson, meta) },
    create: { tenantId, provider: IntegrationProvider.ZID, ...tokenData, metadataJson: meta as Prisma.InputJsonValue },
  });
}

async function createTenantFromZid(profile: ZidStoreProfile, storeName: string, tokenData: TokenData): Promise<string> {
  const email = profile.email!;
  const ownerName = profile.ownerName ?? storeName;
  const platformSettings = await getPlatformSettings();
  const plan =
    (await superAdminDb.plan.findFirst({ where: { key: "starter", isActive: true } })) ??
    (await superAdminDb.plan.findFirst({ where: { isActive: true }, orderBy: { priceMonthlySar: "asc" } }));
  if (!plan) throw new Error("لا توجد باقة مفعّلة لإنشاء حساب تاجر زد");

  let slug = slugify(profile.storeUrl?.replace(/^https?:\/\//, "").split(/[./]/)[0] || storeName) || `zid-${profile.storeId}`;
  if (await superAdminDb.tenant.findUnique({ where: { slug } })) slug = `${slug}-${crypto.randomBytes(2).toString("hex")}`;

  const rawSetupToken = crypto.randomBytes(32).toString("hex");
  const setupTokenHash = crypto.createHash("sha256").update(rawSetupToken).digest("hex");
  const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

  const tenantId = await superAdminDb.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { slug, name: storeName, status: "PENDING_REVIEW", joinSource: "ZID_APP", country: "SA" } });
    const owner = await tx.user.create({ data: { tenantId: tenant.id, name: ownerName, email, passwordHash: placeholderHash, role: "OWNER" } });
    await tx.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: "TRIALING", currentPeriodEnd: new Date(Date.now() + platformSettings.defaultTrialDays * 24 * 3600 * 1000) },
    });
    for (const provider of ["META_WHATSAPP", "SALLA"] as const) {
      await tx.integration.create({ data: { tenantId: tenant.id, provider, status: "DISCONNECTED", isSandbox: true } });
    }
    await tx.integration.create({
      data: { tenantId: tenant.id, provider: IntegrationProvider.ZID, ...tokenData, metadataJson: { ...storeMeta(profile), linkMethod: "new_account", installedAt: new Date().toISOString() } },
    });
    await tx.approvalRequest.create({
      data: { tenantId: tenant.id, type: "NEW_TENANT", status: "PENDING", payloadJson: { source: "zid_app", zidStoreId: profile.storeId, storeDomain: profile.storeUrl, requestedPlanKey: plan.key } },
    });
    await tx.accountSetupToken.create({ data: { userId: owner.id, tokenHash: setupTokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) } });
    await tx.auditLog.create({ data: { tenantId: tenant.id, action: "tenant.created_from_zid", targetType: "Tenant", targetId: tenant.id, metaJson: { storeId: profile.storeId, storeName } } });
    return tenant.id;
  });

  await sendEmail(zidAccountCreatedEmail({ to: email, ownerName, storeName, setupToken: rawSetupToken })).catch((err) => console.error("zid account email failed:", err));
  return tenantId;
}

/** حذف التطبيق من زد (app.market.application.uninstall): زد تُبطل الرموز فوراً — نفك الربط ونُبقي البيانات. */
export async function handleZidUninstall(storeId: string): Promise<string | null> {
  const integration = await superAdminDb.integration.findFirst({ where: { provider: IntegrationProvider.ZID, externalAccountId: storeId, isSandbox: false } });
  if (!integration) return null;
  await superAdminDb.integration.update({
    where: { id: integration.id },
    data: {
      status: "DISCONNECTED", encryptedAccessToken: null, encryptedRefreshToken: null, tokenExpiresAt: null, webhookTokenHash: null, webhookSubscribed: false,
      lastError: "تم حذف التطبيق من متجر زد",
      metadataJson: mergeMeta(integration.metadataJson, { uninstalledAt: new Date().toISOString() }),
    },
  });
  await superAdminDb.auditLog.create({ data: { tenantId: integration.tenantId, action: "integration.zid_uninstalled", targetType: "Integration", targetId: "ZID", metaJson: { storeId } } });
  return integration.tenantId;
}
