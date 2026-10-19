import { rawDb } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

/**
 * إعدادات تطبيق زد (Partner App) — لوحة الأدمن (/admin/zid، PlatformSettings والأسرار مشفَّرة) أولاً،
 * ومتغيرات البيئة ZID_* احتياط لكل حقل لم يُضبط. ذاكرة مؤقتة 30 ثانية تُمسح فور الحفظ من اللوحة.
 */
export type ZidConfig = {
  appId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  /** قيمة الترويسة X-DMS-Zid-Token التي يضيفها شريك زد لأحداث متجر التطبيقات (تثبيت/حذف/اشتراك). */
  marketSecret: string | null;
  planMap: Record<string, string>;
  sources: Record<"appId" | "clientId" | "clientSecret" | "marketSecret" | "planMap", "admin" | "env" | "none">;
};

const TTL_MS = 30_000;
let cache: { value: ZidConfig; at: number } | null = null;

const envValue = (name: string) => process.env[name]?.trim() || null;

function envPlanMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(process.env.ZID_PLAN_MAP || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    console.error("⚠️ تعذّر فك تشفير سر تطبيق زد المخزَّن (تغيّر ENCRYPTION_KEY؟) — يُستخدم متغير البيئة إن وُجد");
    return null;
  }
}

async function load(): Promise<ZidConfig> {
  const row = await rawDb.platformSettings.findUnique({ where: { id: "singleton" } });
  const pick = (admin: string | null | undefined, env: string) => {
    const a = admin?.trim() || null;
    const e = envValue(env);
    return { value: a ?? e, source: (a ? "admin" : e ? "env" : "none") as "admin" | "env" | "none" };
  };
  const appId = pick(row?.zidAppId, "ZID_APP_ID");
  const clientId = pick(row?.zidClientId, "ZID_CLIENT_ID");
  const clientSecret = pick(safeDecrypt(row?.encryptedZidClientSecret), "ZID_CLIENT_SECRET");
  const marketSecret = pick(safeDecrypt(row?.encryptedZidMarketSecret), "ZID_MARKET_SECRET");
  const adminMap = row?.zidPlanMapJson && typeof row.zidPlanMapJson === "object" && !Array.isArray(row.zidPlanMapJson) ? (row.zidPlanMapJson as Record<string, string>) : null;
  const hasAdminMap = !!adminMap && Object.keys(adminMap).length > 0;
  const env = envPlanMap();
  return {
    appId: appId.value, clientId: clientId.value, clientSecret: clientSecret.value, marketSecret: marketSecret.value,
    planMap: hasAdminMap ? adminMap! : env,
    sources: {
      appId: appId.source, clientId: clientId.source, clientSecret: clientSecret.source, marketSecret: marketSecret.source,
      planMap: hasAdminMap ? "admin" : Object.keys(env).length ? "env" : "none",
    },
  };
}

export async function getZidConfig(): Promise<ZidConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await load();
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateZidConfig() {
  cache = null;
}

/** قراءة متزامنة لآخر قيم مُحمَّلة — لمسار getAuthorizationUrl المتزامن (المتصل يسخّن الذاكرة قبلها). */
export function zidConfigCached(): Pick<ZidConfig, "appId" | "clientId" | "clientSecret"> {
  if (cache) return cache.value;
  return { appId: envValue("ZID_APP_ID"), clientId: envValue("ZID_CLIENT_ID"), clientSecret: envValue("ZID_CLIENT_SECRET") };
}
