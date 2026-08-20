"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { encryptMetaAppSecret, encryptOpenAiApiKey } from "@/lib/platformSettings";

export async function updatePlatformSettings(formData: FormData) {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.settings.manage");

  const integrationsMode = formData.get("integrationsMode") === "live" ? "live" : "sandbox";
  const maintenanceMode = formData.get("maintenanceMode") === "on";
  const maintenanceMessage = String(formData.get("maintenanceMessage") ?? "").trim() || null;
  const supportEmail = String(formData.get("supportEmail") ?? "").trim() || "support@platform.sa";
  const supportPhone = String(formData.get("supportPhone") ?? "").trim() || null;
  const defaultTrialDays = Math.max(1, parseInt(String(formData.get("defaultTrialDays") ?? "14"), 10) || 14);
  const termsVersion = String(formData.get("termsVersion") ?? "").trim() || null;
  const vatPercent = Math.max(0, Math.min(100, parseFloat(String(formData.get("vatPercent") ?? "15")) || 15));
  const vatRateBps = Math.round(vatPercent * 100);
  const defaultCurrency = String(formData.get("defaultCurrency") ?? "SAR").trim().toUpperCase() || "SAR";
  const metaAppId = String(formData.get("metaAppId") ?? "").trim() || null;
  const emailProviderName = String(formData.get("emailProviderName") ?? "console").trim() || "console";
  const smsProviderName = String(formData.get("smsProviderName") ?? "none").trim() || "none";
  const sellerLegalName = String(formData.get("sellerLegalName") ?? "").trim() || "DMS — Digital Messaging System";
  const sellerVatNumber = String(formData.get("sellerVatNumber") ?? "").trim() || null;
  const sellerAddress = String(formData.get("sellerAddress") ?? "").trim() || null;
  const aiModel = String(formData.get("aiModel") ?? "gpt-4o-mini").trim() || "gpt-4o-mini";

  // السر لا يُعاد عرضه أبداً في النموذج (لا يُملأ الحقل بالقيمة الحالية) — يُحدَّث فقط لو أُدخِلت
  // قيمة جديدة فعلياً، تفادياً لإعادة كتابة قيمة فارغة فوق سرّ حقيقي محفوظ لمجرد حفظ النموذج.
  const rawMetaAppSecret = String(formData.get("metaAppSecret") ?? "").trim();
  const encryptedMetaAppSecret = rawMetaAppSecret ? encryptMetaAppSecret(rawMetaAppSecret) : undefined;
  const rawOpenAiApiKey = String(formData.get("openAiApiKey") ?? "").trim();
  const encryptedOpenAiApiKey = rawOpenAiApiKey ? encryptOpenAiApiKey(rawOpenAiApiKey) : undefined;

  await superAdminDb.platformSettings.upsert({
    where: { id: "singleton" },
    update: {
      integrationsMode, maintenanceMode, maintenanceMessage, supportEmail, supportPhone, defaultTrialDays, termsVersion,
      vatRateBps, defaultCurrency, metaAppId, emailProviderName, smsProviderName,
      sellerLegalName, sellerVatNumber, sellerAddress, aiModel,
      ...(encryptedMetaAppSecret ? { encryptedMetaAppSecret } : {}),
      ...(encryptedOpenAiApiKey ? { encryptedOpenAiApiKey } : {}),
    },
    create: {
      id: "singleton", integrationsMode, maintenanceMode, maintenanceMessage, supportEmail, supportPhone, defaultTrialDays, termsVersion,
      vatRateBps, defaultCurrency, metaAppId, emailProviderName, smsProviderName, encryptedMetaAppSecret,
      sellerLegalName, sellerVatNumber, sellerAddress, aiModel, encryptedOpenAiApiKey,
    },
  });

  await superAdminDb.auditLog.create({
    data: {
      userId: session.user.id, action: "platform.settings_update", targetType: "PlatformSettings",
      metaJson: {
        integrationsMode, maintenanceMode, vatRateBps, defaultCurrency, metaAppSecretChanged: !!encryptedMetaAppSecret,
        aiModel, openAiApiKeyChanged: !!encryptedOpenAiApiKey,
      },
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
  revalidatePath("/login");
}
