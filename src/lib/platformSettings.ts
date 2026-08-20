import { rawDb } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// PlatformSettings صف عام وحيد (لا tenantId، غير خاضع لـ RLS) — قراءة/كتابة عبر rawDb آمنة تماماً.
const SINGLETON_ID = "singleton";

export type PlatformSettingsData = {
  integrationsMode: "sandbox" | "live";
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  supportEmail: string;
  supportPhone: string | null;
  defaultTrialDays: number;
  termsVersion: string | null;
  vatRateBps: number;
  defaultCurrency: string;
  metaAppId: string | null;
  /** فك التشفير هنا مباشرة — نفس آلية encryptedAccessToken في Integration، القيمة الخام لا تُخزَّن أبداً. */
  metaAppSecret: string | null;
  emailProviderName: string;
  smsProviderName: string;
  sellerLegalName: string;
  sellerVatNumber: string | null;
  sellerAddress: string | null;
  openAiApiKey: string | null;
  aiModel: string;
  platformChatEnabled: boolean;
  platformChatVoiceReplyEnabled: boolean;
};

/** يجلب إعدادات المنصة العامة، وينشئ الصف الافتراضي تلقائياً إن لم يوجد بعد (أول تشغيل). */
export async function getPlatformSettings(): Promise<PlatformSettingsData> {
  const row = await rawDb.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });

  return {
    integrationsMode: row.integrationsMode === "live" ? "live" : "sandbox",
    maintenanceMode: row.maintenanceMode,
    maintenanceMessage: row.maintenanceMessage,
    supportEmail: row.supportEmail,
    supportPhone: row.supportPhone,
    defaultTrialDays: row.defaultTrialDays,
    termsVersion: row.termsVersion,
    vatRateBps: row.vatRateBps,
    defaultCurrency: row.defaultCurrency,
    metaAppId: row.metaAppId,
    metaAppSecret: row.encryptedMetaAppSecret ? decryptSecret(row.encryptedMetaAppSecret) : null,
    emailProviderName: row.emailProviderName,
    smsProviderName: row.smsProviderName,
    sellerLegalName: row.sellerLegalName,
    sellerVatNumber: row.sellerVatNumber,
    sellerAddress: row.sellerAddress,
    openAiApiKey: row.encryptedOpenAiApiKey ? decryptSecret(row.encryptedOpenAiApiKey) : (process.env.OPENAI_API_KEY || null),
    aiModel: row.aiModel || process.env.OPENAI_MODEL || "gpt-4o-mini",
    platformChatEnabled: row.platformChatEnabled,
    platformChatVoiceReplyEnabled: row.platformChatVoiceReplyEnabled,
  };
}

/** يشفّر سر تطبيق Meta قبل التخزين — يُستدعى فقط من admin/settings/actions.ts. */
export function encryptMetaAppSecret(plaintext: string): string {
  return encryptSecret(plaintext);
}

/** يشفّر مفتاح OpenAI قبل التخزين — نفس آلية encryptMetaAppSecret تماماً. */
export function encryptOpenAiApiKey(plaintext: string): string {
  return encryptSecret(plaintext);
}

/** فحص سريع مستخدم داخل adapters التكامل — يحل محل قراءة `process.env.INTEGRATIONS_MODE` مباشرة. */
export async function isSandboxModeFromSettings(): Promise<boolean> {
  const settings = await getPlatformSettings();
  return settings.integrationsMode !== "live";
}
