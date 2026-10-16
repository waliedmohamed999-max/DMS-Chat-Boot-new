import { NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { redisConnection } from "@/lib/queue/connection";

export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS)),
  ]);
}

async function check(fn: () => Promise<unknown>): Promise<{ ok: boolean; ms: number }> {
  const started = Date.now();
  try {
    await withTimeout(fn());
    return { ok: true, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  }
}

/**
 * فحص صحة عام لخدمات المراقبة الخارجية (UptimeRobot/Better Stack وغيرها): 200 لو قاعدة البيانات
 * وRedis يستجيبان، 503 لو أي منهما معطَّل. لا يكشف أي تفاصيل داخلية (لا رسائل أخطاء ولا عناوين).
 */
export async function GET() {
  const [database, redis] = await Promise.all([
    check(() => rawDb.$queryRaw`SELECT 1`),
    check(() => redisConnection.ping()),
  ]);
  const ok = database.ok && redis.ok;
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, redis, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
