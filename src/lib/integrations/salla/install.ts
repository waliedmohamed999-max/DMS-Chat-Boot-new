import crypto from "crypto";
import bcrypt from "bcryptjs";
import { IntegrationProvider, Prisma } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { slugify } from "@/lib/slug";
import { getPlatformSettings } from "@/lib/platformSettings";
import { sendEmail } from "@/lib/email/send";
import { sallaAccountCreatedEmail, sallaStoreLinkedEmail } from "@/lib/email/sallaTemplates";
import { fetchSallaUserInfo, parseSallaExpires, type SallaStoreInfo } from "./api";
import { startInitialSallaSync } from "./sync";
import { applyIntentToTenant, requestLinkConfirmation } from "./intent";

export type SallaAuthorizeResult =
  | { outcome: "refreshed" | "linked_existing" | "created_account"; tenantId: string }
  | { outcome: "awaiting_confirmation"; email: string }
  | { outcome: "conflict"; reason: string };

type AuthorizeData = { access_token?: string; refresh_token?: string; expires?: unknown; scope?: string };

type TokenData = {
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  tokenExpiresAt: Date;
  status: "CONNECTED";
  isSandbox: false;
  externalAccountId: string;
  lastError: null;
};

/**
 * معالجة حدث app.store.authorize (النمط السهل): سلة ترسل رموز الوصول بعد تثبيت التاجر للتطبيق أو تحديثه.
 * تحديد التاجر عندنا بالترتيب:
 *  1) متجر مربوط مسبقاً بنفس رقم التاجر → تحديث الرموز فقط (تحديث التطبيق/إعادة التثبيت).
 *  2) مالك حساب DMS بنفس بريد متجر سلة → ربط المتجر بحسابه تلقائياً + إشعار بالبريد.
 *  3) لا يوجد حساب → إنشاء حساب جديد بنفس مسار /register (بانتظار المراجعة + طلب في مركز الموافقات)
 *     + رابط تحديد كلمة المرور على بريد المتجر.
 * أي حالة غامضة (البريد لموظف/عضو فريق منصة، أو الحساب مربوط بمتجر سلة آخر) لا تُربَط تلقائياً.
 */
export async function handleSallaAuthorize(merchantId: string, data: AuthorizeData): Promise<SallaAuthorizeResult> {
  if (!data.access_token || !data.refresh_token) return { outcome: "conflict", reason: "حدث التفويض بلا رموز وصول" };

  const tokenData: TokenData = {
    encryptedAccessToken: encryptSecret(data.access_token),
    encryptedRefreshToken: encryptSecret(data.refresh_token),
    tokenExpiresAt: parseSallaExpires(data.expires),
    status: "CONNECTED",
    isSandbox: false,
    externalAccountId: merchantId,
    lastError: null,
  };

  // (1) متجر مربوط مسبقاً
  const existing = await superAdminDb.integration.findFirst({
    where: { provider: IntegrationProvider.SALLA, externalAccountId: merchantId, isSandbox: false },
  });
  if (existing) {
    await superAdminDb.integration.update({
      where: { id: existing.id },
      data: { ...tokenData, metadataJson: mergeMeta(existing.metadataJson, { scope: data.scope ?? null, reauthorizedAt: new Date().toISOString() }) },
    });
    await applyIntentToTenant(merchantId, existing.tenantId);
    return { outcome: "refreshed", tenantId: existing.tenantId };
  }

  const store = await fetchSallaUserInfo(data.access_token);
  if (!store.email) return { outcome: "conflict", reason: "لم تُرسل سلة بريداً لصاحب المتجر — تعذّر تحديد الحساب" };
  const storeName = store.storeName ?? `متجر سلة ${merchantId}`;
  const meta = storeMeta(store, merchantId, data.scope);

  // خطوة الإعداد "لديك حساب DMS ببريد مختلف؟" — لا ربط تلقائي ببريد كتبه المُثبِّت، بل رابط تأكيد
  // لصاحب ذلك البريد (lib/integrations/salla/intent.ts) والرموز محفوظة مشفَّرة بانتظار التأكيد.
  const intent = await superAdminDb.sallaInstallIntent.findUnique({ where: { merchantId } });
  if (intent?.requestedEmail && intent.requestedEmail !== store.email) {
    const owner = await superAdminDb.user.findUnique({ where: { email: intent.requestedEmail } });
    if (owner && owner.role === "OWNER" && owner.tenantId && owner.isActive) {
      await requestLinkConfirmation({
        merchantId, owner: { email: owner.email, name: owner.name }, storeName,
        encryptedAccessToken: tokenData.encryptedAccessToken, encryptedRefreshToken: tokenData.encryptedRefreshToken, tokenExpiresAt: tokenData.tokenExpiresAt,
      });
      return { outcome: "awaiting_confirmation", email: owner.email };
    }
  }

  const user = await superAdminDb.user.findUnique({ where: { email: store.email } });

  // (2) مالك حساب قائم بنفس البريد
  if (user) {
    if (user.role !== "OWNER" || !user.tenantId) {
      return { outcome: "conflict", reason: `البريد ${store.email} مسجَّل لحساب ليس مالك متجر — يحتاج ربطاً يدوياً` };
    }
    const tenantId = user.tenantId;
    const current = await superAdminDb.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } });
    if (current && !current.isSandbox && current.status === "CONNECTED" && current.externalAccountId && current.externalAccountId !== merchantId) {
      return { outcome: "conflict", reason: `حساب ${store.email} مربوط مسبقاً بمتجر سلة آخر (${current.externalAccountId})` };
    }
    await superAdminDb.$transaction(async (tx) => {
      await tx.integration.upsert({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
        update: { ...tokenData, metadataJson: { ...meta, linkMethod: "email_match" } },
        create: { tenantId, provider: IntegrationProvider.SALLA, ...tokenData, metadataJson: { ...meta, linkMethod: "email_match" } },
      });
      await tx.auditLog.create({
        data: { tenantId, action: "integration.salla_linked_by_email", targetType: "Integration", targetId: "SALLA", metaJson: { merchantId, storeName } },
      });
    });
    await sendEmail(sallaStoreLinkedEmail({ to: user.email, ownerName: user.name, storeName })).catch((err) =>
      console.error("salla linked email failed:", err)
    );
    await applyIntentToTenant(merchantId, tenantId);
    startInitialSallaSync(tenantId);
    return { outcome: "linked_existing", tenantId };
  }

  // (3) حساب جديد
  const tenantId = await createTenantFromSalla(store, storeName, merchantId, tokenData, meta);
  await applyIntentToTenant(merchantId, tenantId);
  startInitialSallaSync(tenantId);
  return { outcome: "created_account", tenantId };
}

async function createTenantFromSalla(
  store: SallaStoreInfo,
  storeName: string,
  merchantId: string,
  tokenData: TokenData,
  meta: Record<string, unknown>
): Promise<string> {
  const email = store.email!;
  const ownerName = store.ownerName ?? storeName;
  const platformSettings = await getPlatformSettings();
  const plan =
    (await superAdminDb.plan.findFirst({ where: { key: "starter", isActive: true } })) ??
    (await superAdminDb.plan.findFirst({ where: { isActive: true }, orderBy: { priceMonthlySar: "asc" } }));
  if (!plan) throw new Error("لا توجد باقة مفعّلة لإنشاء حساب تاجر سلة");

  let slug = slugify(store.storeDomain?.replace(/^https?:\/\//, "").split(/[./]/)[0] || storeName) || `salla-${merchantId}`;
  if (await superAdminDb.tenant.findUnique({ where: { slug } })) slug = `${slug}-${crypto.randomBytes(2).toString("hex")}`;

  const rawSetupToken = crypto.randomBytes(32).toString("hex");
  const setupTokenHash = crypto.createHash("sha256").update(rawSetupToken).digest("hex");
  // كلمة مرور عشوائية غير معروفة لأحد — التاجر يحدد كلمته عبر رابط الإعداد (نفس أسلوب دعوة الفريق).
  const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

  const tenantId = await superAdminDb.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { slug, name: storeName, status: "PENDING_REVIEW", joinSource: "SALLA_APP", country: "SA" },
    });
    const owner = await tx.user.create({
      data: { tenantId: tenant.id, name: ownerName, email, passwordHash: placeholderHash, role: "OWNER" },
    });
    await tx.subscription.create({
      data: {
        tenantId: tenant.id, planId: plan.id, status: "TRIALING",
        currentPeriodEnd: new Date(Date.now() + platformSettings.defaultTrialDays * 24 * 3600 * 1000),
      },
    });
    for (const provider of ["META_WHATSAPP", "ZID"] as const) {
      await tx.integration.create({ data: { tenantId: tenant.id, provider, status: "DISCONNECTED", isSandbox: true } });
    }
    await tx.integration.create({
      data: { tenantId: tenant.id, provider: IntegrationProvider.SALLA, ...tokenData, metadataJson: { ...meta, linkMethod: "new_account" } },
    });
    await tx.approvalRequest.create({
      data: {
        tenantId: tenant.id, type: "NEW_TENANT", status: "PENDING",
        payloadJson: { source: "salla_app", sallaMerchantId: merchantId, storeDomain: store.storeDomain, requestedPlanKey: plan.key },
      },
    });
    await tx.accountSetupToken.create({
      data: { userId: owner.id, tokenHash: setupTokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
    });
    await tx.auditLog.create({
      data: { tenantId: tenant.id, action: "tenant.created_from_salla", targetType: "Tenant", targetId: tenant.id, metaJson: { merchantId, storeName } },
    });
    return tenant.id;
  });

  await sendEmail(sallaAccountCreatedEmail({ to: email, ownerName, storeName, setupToken: rawSetupToken })).catch((err) =>
    console.error("salla account email failed:", err)
  );
  return tenantId;
}

function storeMeta(store: SallaStoreInfo, merchantId: string, scope?: string) {
  return {
    merchantId,
    storeName: store.storeName,
    storeDomain: store.storeDomain,
    storeEmail: store.email,
    scope: scope ?? null,
    installedAt: new Date().toISOString(),
  };
}

function mergeMeta(current: Prisma.JsonValue | null, patch: Record<string, unknown>): Prisma.InputJsonValue {
  const base = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

/** حدث app.uninstalled: فك الربط وحذف الرموز (سلة تُبطلها أصلاً) مع الإبقاء على البيانات المزامَنة. */
export async function handleSallaUninstall(merchantId: string): Promise<string | null> {
  const integration = await superAdminDb.integration.findFirst({
    where: { provider: IntegrationProvider.SALLA, externalAccountId: merchantId, isSandbox: false },
  });
  if (!integration) return null;
  await superAdminDb.integration.update({
    where: { id: integration.id },
    data: {
      status: "DISCONNECTED", encryptedAccessToken: null, encryptedRefreshToken: null, tokenExpiresAt: null,
      lastError: "تم حذف التطبيق من متجر سلة",
      metadataJson: mergeMeta(integration.metadataJson, { uninstalledAt: new Date().toISOString() }),
    },
  });
  await superAdminDb.auditLog.create({
    data: { tenantId: integration.tenantId, action: "integration.salla_uninstalled", targetType: "Integration", targetId: "SALLA", metaJson: { merchantId } },
  });
  return integration.tenantId;
}
