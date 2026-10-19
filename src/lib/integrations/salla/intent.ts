import crypto from "crypto";
import { IntegrationProvider, Prisma } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { sallaLinkConfirmEmail } from "@/lib/email/sallaTemplates";
import { startInitialSallaSync } from "./sync";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRM_TTL_MS = 7 * 24 * 3600 * 1000;

export type OnboardingResult = { ok: true } | { ok: false; message: string; fields: Record<string, string[]> };

function truthy(v: unknown): boolean | null {
  if (v === undefined || v === null || v === "") return null;
  if (Array.isArray(v)) return v.length > 0;
  return v === true || v === 1 || ["1", "true", "on", "yes", "نعم"].includes(String(v).toLowerCase());
}

/**
 * حفظ خطوة إعداد (onboarding) من تطبيق DMS في سلة. الخطوات تسبق حدث app.store.authorize، فتُحفظ
 * بمعرّف التاجر وتُطبَّق عند الربط (install.ts). أخطاء التحقق تعود بمعرّفات الحقول نفسها لتظهر تحتها.
 *  - account:     dms_email (اختياري) — بريد حساب DMS قائم يختلف عن بريد المتجر.
 *  - preferences: whatsapp_number (اختياري)، abandoned_cart، welcome (تفعيل الرسائل التلقائية).
 */
export async function saveOnboardingStep(merchantId: string, step: string, fields: Record<string, unknown>): Promise<OnboardingResult> {
  if (step === "account") {
    const email = typeof fields.dms_email === "string" ? fields.dms_email.trim().toLowerCase() : "";
    if (email) {
      if (!EMAIL_RE.test(email)) return { ok: false, message: "البريد غير صحيح", fields: { dms_email: ["أدخل بريداً إلكترونياً صحيحاً"] } };
      const user = await superAdminDb.user.findUnique({ where: { email }, select: { role: true, tenantId: true, isActive: true } });
      if (!user || user.role !== "OWNER" || !user.tenantId || !user.isActive) {
        return { ok: false, message: "لا يوجد حساب بهذا البريد", fields: { dms_email: ["لا يوجد حساب مالك متجر في DMS بهذا البريد — اتركه فارغاً لننشئ لك حساباً جديداً"] } };
      }
    }
    await superAdminDb.sallaInstallIntent.upsert({
      where: { merchantId },
      update: { requestedEmail: email || null },
      create: { merchantId, requestedEmail: email || null },
    });
    return { ok: true };
  }

  if (step === "preferences") {
    const raw = typeof fields.whatsapp_number === "string" ? fields.whatsapp_number.replace(/[\s-]/g, "") : "";
    let whatsappNumber: string | null = null;
    if (raw) {
      const normalized = raw.startsWith("+") ? raw : raw.startsWith("05") ? `+966${raw.slice(1)}` : raw.startsWith("966") ? `+${raw}` : raw;
      if (!/^\+\d{9,15}$/.test(normalized)) {
        return { ok: false, message: "رقم واتساب غير صحيح", fields: { whatsapp_number: ["أدخل الرقم بصيغة دولية مثل +9665XXXXXXXX"] } };
      }
      whatsappNumber = normalized;
    }
    const data = { whatsappNumber, wantsAbandonedCart: truthy(fields.abandoned_cart), wantsWelcome: truthy(fields.welcome) };
    await superAdminDb.sallaInstallIntent.upsert({ where: { merchantId }, update: data, create: { merchantId, ...data } });
    return { ok: true };
  }

  return { ok: false, message: "خطوة غير معروفة", fields: {} };
}

/** بيانات خطوات الإعداد تُدمج في metadata تكامل سلة للتاجر بعد ربطه بأي طريقة، ويُعلَّم الطلب LINKED. */
export async function applyIntentToTenant(merchantId: string, tenantId: string) {
  const intent = await superAdminDb.sallaInstallIntent.findUnique({ where: { merchantId } });
  if (!intent) return;
  const integration = await superAdminDb.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } });
  if (integration) {
    const meta = (integration.metadataJson && typeof integration.metadataJson === "object" ? integration.metadataJson : {}) as Record<string, any>;
    const requested: Record<string, boolean> = { ...(meta.requestedAutomations ?? {}) };
    if (intent.wantsAbandonedCart !== null) requested.abandonedCart = intent.wantsAbandonedCart;
    if (intent.wantsWelcome !== null) requested.welcome = intent.wantsWelcome;
    await superAdminDb.integration.update({
      where: { id: integration.id },
      data: {
        metadataJson: {
          ...meta,
          ...(intent.whatsappNumber ? { whatsappNumber: intent.whatsappNumber } : {}),
          requestedAutomations: requested,
        } as Prisma.InputJsonValue,
      },
    });
  }
  await superAdminDb.sallaInstallIntent.update({
    where: { merchantId },
    data: { status: "LINKED", tenantId, encryptedAccessToken: null, encryptedRefreshToken: null, confirmTokenHash: null },
  });
}

/**
 * طلب ربط متجر ببريد مختلف عن بريد المتجر: الرموز تُحفظ مشفَّرة في الطلب ويُرسل رابط تأكيد لصاحب
 * البريد — لا ربط قبل تأكيده (إثبات ملكية البريد يمنع ربط متجر بحساب شخص آخر بمجرد كتابة بريده).
 */
export async function requestLinkConfirmation(input: {
  merchantId: string; owner: { email: string; name: string }; storeName: string;
  encryptedAccessToken: string; encryptedRefreshToken: string; tokenExpiresAt: Date;
}) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  await superAdminDb.sallaInstallIntent.update({
    where: { merchantId: input.merchantId },
    data: {
      status: "AWAITING_CONFIRMATION", storeName: input.storeName,
      encryptedAccessToken: input.encryptedAccessToken, encryptedRefreshToken: input.encryptedRefreshToken, tokenExpiresAt: input.tokenExpiresAt,
      confirmTokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"), confirmExpiresAt: new Date(Date.now() + CONFIRM_TTL_MS),
    },
  });
  await sendEmail(sallaLinkConfirmEmail({ to: input.owner.email, ownerName: input.owner.name, storeName: input.storeName, confirmToken: rawToken }));
}

export async function findPendingLink(rawToken: string) {
  const confirmTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const intent = await superAdminDb.sallaInstallIntent.findUnique({ where: { confirmTokenHash } });
  if (!intent || intent.status !== "AWAITING_CONFIRMATION" || !intent.confirmExpiresAt || intent.confirmExpiresAt < new Date() || !intent.requestedEmail) return null;
  return intent;
}

export type ConfirmLinkResult = { ok: true; storeName: string } | { ok: false; error: string };

/** تأكيد الربط من رابط البريد: نقل الرموز من الطلب إلى تكامل سلة لحساب صاحب البريد وبدء المزامنة. */
export async function confirmSallaLink(rawToken: string): Promise<ConfirmLinkResult> {
  const intent = await findPendingLink(rawToken);
  if (!intent) return { ok: false, error: "رابط التأكيد غير صالح أو منتهي الصلاحية." };

  const owner = await superAdminDb.user.findUnique({ where: { email: intent.requestedEmail! } });
  if (!owner || owner.role !== "OWNER" || !owner.tenantId) return { ok: false, error: "الحساب المطلوب لم يعد متاحاً للربط." };
  const tenantId = owner.tenantId;

  const current = await superAdminDb.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } });
  if (current && !current.isSandbox && current.status === "CONNECTED" && current.externalAccountId && current.externalAccountId !== intent.merchantId) {
    return { ok: false, error: "حسابك مربوط بمتجر سلة آخر حالياً — افصله أولاً من صفحة ربط سلة ثم أعد المحاولة." };
  }
  const takenElsewhere = await superAdminDb.integration.findFirst({
    where: { provider: IntegrationProvider.SALLA, externalAccountId: intent.merchantId, isSandbox: false, NOT: { tenantId } },
  });
  if (takenElsewhere) return { ok: false, error: "هذا المتجر مربوط بحساب آخر بالفعل." };

  const tokenData = {
    status: "CONNECTED" as const, isSandbox: false, externalAccountId: intent.merchantId,
    encryptedAccessToken: intent.encryptedAccessToken, encryptedRefreshToken: intent.encryptedRefreshToken, tokenExpiresAt: intent.tokenExpiresAt,
    lastError: null,
    metadataJson: { merchantId: intent.merchantId, storeName: intent.storeName, linkMethod: "email_confirmed", installedAt: new Date().toISOString() },
  };
  await superAdminDb.$transaction(async (tx) => {
    await tx.integration.upsert({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } },
      update: tokenData,
      create: { tenantId, provider: IntegrationProvider.SALLA, ...tokenData },
    });
    await tx.auditLog.create({
      data: { tenantId, userId: owner.id, action: "integration.salla_linked_by_confirmation", targetType: "Integration", targetId: "SALLA", metaJson: { merchantId: intent.merchantId } },
    });
  });
  await applyIntentToTenant(intent.merchantId, tenantId);
  startInitialSallaSync(tenantId);
  return { ok: true, storeName: intent.storeName ?? "متجرك" };
}
