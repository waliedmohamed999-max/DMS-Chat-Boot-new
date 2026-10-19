"use server";

import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { redisConnection } from "@/lib/queue/connection";
import { isD360Configured, pingD360Partner } from "@/lib/integrations/d360/client";
import { isMoyasarConfigured, pingMoyasar } from "@/lib/billing/moyasar";

export type TestResult = { ok: boolean; detail: string };

/** اختبار اتصال فعلي بحساب خارجي من صفحة جاهزية الربط — بلا كشف أي مفتاح، وبلا إنشاء أي شيء. */
export async function testSetupConnection(kind: "core" | "d360" | "moyasar"): Promise<TestResult> {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.settings.manage");
  try {
    if (kind === "core") {
      await superAdminDb.$queryRaw`SELECT 1`;
      const pong = await Promise.race([
        redisConnection.ping(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("مهلة Redis انتهت")), 5000)),
      ]);
      return { ok: pong === "PONG", detail: `قاعدة البيانات ✓ · Redis ${pong === "PONG" ? "✓" : pong}` };
    }
    if (kind === "d360") {
      if (!isD360Configured()) return { ok: false, detail: "أضف D360_PARTNER_ID وD360_API_KEY أولاً" };
      const { channels } = await pingD360Partner();
      return { ok: true, detail: `حساب الشريك يعمل ✓${channels !== null ? ` · ${channels} قناة` : ""}` };
    }
    if (kind === "moyasar") {
      if (!isMoyasarConfigured()) return { ok: false, detail: "أضف MOYASAR_SECRET_KEY أولاً" };
      const { mode } = await pingMoyasar();
      return { ok: true, detail: `المفتاح صحيح ✓ · ${mode === "live" ? "وضع حقيقي" : mode === "test" ? "وضع اختبار" : "وضع غير معروف"}` };
    }
    return { ok: false, detail: "نوع غير معروف" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "فشل الاختبار" };
  }
}
