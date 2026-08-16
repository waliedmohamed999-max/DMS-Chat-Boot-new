import crypto from "crypto";
import { redisConnection } from "@/lib/queue/connection";

const STATE_TTL_SECONDS = 600; // 10 دقائق — وقت كافٍ لإكمال تفويض OAuth حقيقي على زد/سلة

/** ينشئ ويخزّن قيمة state عشوائية لمنع CSRF أثناء تدفق OAuth — تُقارَن عند رجوع الـcallback. */
export async function createOAuthState(provider: string, tenantId: string): Promise<string> {
  const state = crypto.randomBytes(24).toString("hex");
  await redisConnection.set(`oauth-state:${provider}:${state}`, tenantId, "EX", STATE_TTL_SECONDS);
  return state;
}

/** يتحقق من state ويعيد tenantId المرتبط به إن كان صالحاً — يُحذَف فور الاستخدام (لا إعادة استخدام). */
export async function consumeOAuthState(provider: string, state: string): Promise<string | null> {
  const key = `oauth-state:${provider}:${state}`;
  const tenantId = await redisConnection.get(key);
  if (!tenantId) return null;
  await redisConnection.del(key);
  return tenantId;
}
