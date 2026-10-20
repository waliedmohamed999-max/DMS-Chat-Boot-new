import { rawDb } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * مفاتيح الحسابات الخارجية (360dialog، Moyasar، البريد SMTP) — تُضبط من لوحة الأدمن ← جاهزية الربط بدل
 * متغيرات Hostinger. تُخزَّن كـJSON واحد مشفَّر (AES عبر ENCRYPTION_KEY) في PlatformSettings، ولا يُعاد أي سر
 * للمتصفح أبداً بعد حفظه (الواجهة تعرض "مضبوط" فقط). لكل حقل: قيمة اللوحة أولاً ثم متغير البيئة احتياطاً.
 * ذاكرة مؤقتة 30 ثانية لكل عملية، تُمسح فور الحفظ.
 */

export const SECRET_FIELDS = {
  D360_PARTNER_ID: { secret: false },
  D360_API_KEY: { secret: true },
  D360_WEBHOOK_SECRET: { secret: true },
  MOYASAR_SECRET_KEY: { secret: true },
  MOYASAR_WEBHOOK_SECRET: { secret: true },
  EMAIL_PROVIDER: { secret: false },
  SMTP_HOST: { secret: false },
  SMTP_PORT: { secret: false },
  SMTP_USER: { secret: false },
  SMTP_PASS: { secret: true },
  EMAIL_FROM: { secret: false },
} as const;

export type SecretField = keyof typeof SECRET_FIELDS;
export type SecretSource = "admin" | "env" | "none";
export type ResolvedSecrets = Record<SecretField, string | null> & { sources: Record<SecretField, SecretSource> };

const TTL_MS = 30_000;
// ذاكرة على مستوى العملية (globalThis) لا الوحدة: Next.js قد يحمّل نسخاً منفصلة من الوحدة لطبقات الصفحات
// والإجراءات، فمسح ذاكرة وحدة واحدة عند الحفظ كان يترك الصفحة تعرض قيماً قديمة حتى 30 ثانية.
const g = globalThis as typeof globalThis & { __dmsPlatformSecrets?: { value: ResolvedSecrets; at: number } | null };

async function readStored(): Promise<Partial<Record<SecretField, string>>> {
  const row = await rawDb.platformSettings.findUnique({ where: { id: "singleton" }, select: { encryptedIntegrationSecrets: true } });
  if (!row?.encryptedIntegrationSecrets) return {};
  try {
    const parsed = JSON.parse(decryptSecret(row.encryptedIntegrationSecrets));
    return parsed && typeof parsed === "object" ? (parsed as Partial<Record<SecretField, string>>) : {};
  } catch {
    console.error("⚠️ تعذّر فك تشفير مفاتيح الحسابات المخزّنة (تغيّر ENCRYPTION_KEY؟) — تُستخدم متغيرات البيئة");
    return {};
  }
}

export async function getPlatformSecrets(): Promise<ResolvedSecrets> {
  const cache = g.__dmsPlatformSecrets;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const stored = await readStored();
  const value = { sources: {} } as ResolvedSecrets;
  for (const key of Object.keys(SECRET_FIELDS) as SecretField[]) {
    const admin = stored[key]?.trim() || null;
    const env = process.env[key]?.trim() || null;
    value[key] = admin ?? env;
    value.sources[key] = admin ? "admin" : env ? "env" : "none";
  }
  g.__dmsPlatformSecrets = { value, at: Date.now() };
  return value;
}

export function invalidatePlatformSecrets() {
  g.__dmsPlatformSecrets = null;
}

/**
 * يحفظ تعديلات: قيمة نصية = ضبط، null = حذف (رجوع لمتغير البيئة)، غياب المفتاح = بلا تغيير. يعيد أسماء
 * الحقول التي تغيّرت فقط (للتدقيق — بلا أي قيمة).
 */
export async function savePlatformSecrets(patch: Partial<Record<SecretField, string | null>>): Promise<SecretField[]> {
  const stored = await readStored();
  const changed: SecretField[] = [];
  for (const [k, v] of Object.entries(patch) as [SecretField, string | null | undefined][]) {
    if (!(k in SECRET_FIELDS) || v === undefined) continue;
    const next = v === null ? undefined : v.trim();
    if ((stored[k] ?? undefined) === (next || undefined)) continue;
    if (next) stored[k] = next;
    else delete stored[k];
    changed.push(k);
  }
  if (changed.length) {
    const encrypted = Object.keys(stored).length ? encryptSecret(JSON.stringify(stored)) : null;
    await rawDb.platformSettings.upsert({
      where: { id: "singleton" },
      update: { encryptedIntegrationSecrets: encrypted },
      create: { id: "singleton", encryptedIntegrationSecrets: encrypted },
    });
    invalidatePlatformSecrets();
  }
  return changed;
}

/**
 * قراءة متزامنة لآخر قيم محمَّلة (أو متغيرات البيئة إن لم تُحمَّل بعد) — للمسارات المتزامنة بطبيعتها فقط
 * (مثل getAuthorizationUrl في واجهة الـadapter). المتصل يستدعي getPlatformSecrets() قبلها لتسخين الذاكرة.
 */
export function platformSecretsSync(): ResolvedSecrets {
  if (g.__dmsPlatformSecrets) return g.__dmsPlatformSecrets.value;
  const value = { sources: {} } as ResolvedSecrets;
  for (const key of Object.keys(SECRET_FIELDS) as SecretField[]) {
    const env = process.env[key]?.trim() || null;
    value[key] = env;
    value.sources[key] = env ? "env" : "none";
  }
  return value;
}
