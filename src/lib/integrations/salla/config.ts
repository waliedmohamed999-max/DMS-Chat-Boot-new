import { rawDb } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

/**
 * إعدادات تطبيق سلة (Partner App) — المصدر الأول لوحة الأدمن (/admin/salla، مخزَّنة في PlatformSettings
 * والأسرار مشفَّرة)، ومتغيرات البيئة SALLA_* احتياط لكل حقل لم يُضبط من اللوحة. تُخزَّن مؤقتاً 30 ثانية
 * لكل عملية لتفادي قراءة قاعدة البيانات مع كل webhook، وتُمسح فوراً عند الحفظ من اللوحة.
 */
export type SallaConfig = {
  appId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  webhookSecret: string | null;
  functionsSecret: string | null;
  planMap: Record<string, string>;
  /** مصدر كل قيمة — للعرض في لوحة الأدمن فقط. */
  sources: Record<"appId" | "clientId" | "clientSecret" | "webhookSecret" | "functionsSecret" | "planMap", "admin" | "env" | "none">;
};

const TTL_MS = 30_000;
// على مستوى العملية (globalThis): الحفظ من إجراء الأدمن يمسحها لكل طبقات Next.js لا لنسخة وحدة واحدة فقط.
const store = globalThis as typeof globalThis & { __dmsSallaConfig?: { value: SallaConfig; at: number } | null };

function envValue(name: string): string | null {
  return process.env[name]?.trim() || null;
}

function envPlanMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(process.env.SALLA_PLAN_MAP || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    console.error("SALLA_PLAN_MAP ليس JSON صالحاً — تم تجاهله");
    return {};
  }
}

function safeDecrypt(value: string | null): string | null {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    console.error("⚠️ تعذّر فك تشفير سر تطبيق سلة المخزَّن (تغيّر ENCRYPTION_KEY؟) — يُستخدم متغير البيئة إن وُجد");
    return null;
  }
}

async function load(): Promise<SallaConfig> {
  const row = await rawDb.platformSettings.findUnique({ where: { id: "singleton" } });
  const pick = (admin: string | null | undefined, env: string) => {
    const a = admin?.trim() || null;
    const e = envValue(env);
    return { value: a ?? e, source: (a ? "admin" : e ? "env" : "none") as "admin" | "env" | "none" };
  };
  const appId = pick(row?.sallaAppId, "SALLA_APP_ID");
  const clientId = pick(row?.sallaClientId, "SALLA_CLIENT_ID");
  const clientSecret = pick(safeDecrypt(row?.encryptedSallaClientSecret ?? null), "SALLA_CLIENT_SECRET");
  const webhookSecret = pick(safeDecrypt(row?.encryptedSallaWebhookSecret ?? null), "SALLA_WEBHOOK_SECRET");
  const functionsSecret = pick(safeDecrypt(row?.encryptedSallaFunctionsSecret ?? null), "SALLA_FUNCTIONS_SECRET");

  const adminMap = row?.sallaPlanMapJson && typeof row.sallaPlanMapJson === "object" && !Array.isArray(row.sallaPlanMapJson)
    ? (row.sallaPlanMapJson as Record<string, string>)
    : null;
  const hasAdminMap = !!adminMap && Object.keys(adminMap).length > 0;
  const env = envPlanMap();

  return {
    appId: appId.value, clientId: clientId.value, clientSecret: clientSecret.value,
    webhookSecret: webhookSecret.value, functionsSecret: functionsSecret.value,
    planMap: hasAdminMap ? adminMap! : env,
    sources: {
      appId: appId.source, clientId: clientId.source, clientSecret: clientSecret.source,
      webhookSecret: webhookSecret.source, functionsSecret: functionsSecret.source,
      planMap: hasAdminMap ? "admin" : Object.keys(env).length ? "env" : "none",
    },
  };
}

export async function getSallaConfig(): Promise<SallaConfig> {
  if (store.__dmsSallaConfig && Date.now() - store.__dmsSallaConfig.at < TTL_MS) return store.__dmsSallaConfig.value;
  const value = await load();
  store.__dmsSallaConfig = { value, at: Date.now() };
  return value;
}

/** يُستدعى بعد حفظ الإعدادات من لوحة الأدمن — القيم الجديدة تسري فوراً في هذه العملية. */
export function invalidateSallaConfig() {
  store.__dmsSallaConfig = null;
}

/**
 * قراءة متزامنة لآخر قيم مُحمَّلة (أو متغيرات البيئة إن لم تُحمَّل بعد) — فقط للمسارات المتزامنة بطبيعتها
 * (getAuthorizationUrl في واجهة الـadapter). المتصل يستدعي getSallaConfig() قبلها لتسخين الذاكرة.
 */
export function sallaConfigCached(): Pick<SallaConfig, "appId" | "clientId" | "clientSecret"> {
  if (store.__dmsSallaConfig) return store.__dmsSallaConfig.value;
  return { appId: envValue("SALLA_APP_ID"), clientId: envValue("SALLA_CLIENT_ID"), clientSecret: envValue("SALLA_CLIENT_SECRET") };
}

export function sallaInstallUrlFor(appId: string | null): string | null {
  return appId ? `https://s.salla.sa/apps/install/${encodeURIComponent(appId)}` : null;
}
