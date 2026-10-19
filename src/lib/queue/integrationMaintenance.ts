import { Worker, Queue } from "bullmq";
import { redisConnection } from "@/lib/queue/connection";
import { superAdminDb } from "@/lib/db";
import { getValidSallaAccessToken } from "@/lib/integrations/salla/api";
import { getValidZidBundle, zidTokensIssuedAt } from "@/lib/integrations/zid/api";

/**
 * صيانة يومية لرموز متاجر سلة وزد — بدونها يفقد المتجر الهادئ (بلا مزامنة/طلبات API) ربطه بصمت:
 *  - سلة: رمز الوصول ~14 يوماً وrefresh_token ~شهر ⇒ يُجدَّد كل رمز يقترب من الانتهاء.
 *  - زد: refresh_token صالح سنة من إصداره (توصية زد: تجديد مجدول ~كل 10 أشهر) ⇒ يُجدَّد بعد 300 يوم.
 * التجديد نفسه يمر بنفس الدوال المحمية بأقفال Redis (لا تجديدان متزامنان لنفس المتجر).
 */
const INTERVAL_MS = 24 * 3600 * 1000;
const ZID_RENEW_AFTER_MS = 300 * 24 * 3600 * 1000;

export async function runIntegrationTokenMaintenance(): Promise<{ salla: number; zid: number; failed: number }> {
  let salla = 0;
  let zid = 0;
  let failed = 0;

  const sallaDue = await superAdminDb.integration.findMany({
    where: { provider: "SALLA", isSandbox: false, status: "CONNECTED", encryptedRefreshToken: { not: null }, tokenExpiresAt: { lt: new Date(Date.now() + 26 * 3600 * 1000) } },
    select: { tenantId: true },
  });
  for (const { tenantId } of sallaDue) {
    try {
      await getValidSallaAccessToken(tenantId);
      salla++;
    } catch (err) {
      failed++;
      console.error(`⚠️ تعذّر تجديد رمز سلة للمستأجر ${tenantId}:`, err instanceof Error ? err.message : err);
    }
  }

  const zidAll = await superAdminDb.integration.findMany({
    where: { provider: "ZID", isSandbox: false, status: "CONNECTED", encryptedRefreshToken: { not: null } },
    select: { tenantId: true, metadataJson: true },
  });
  for (const row of zidAll) {
    const issued = zidTokensIssuedAt(row.metadataJson);
    if (issued && Date.now() - issued.getTime() < ZID_RENEW_AFTER_MS) continue;
    try {
      await getValidZidBundle(row.tenantId); // يجدّد تلقائياً عند تقادم الرموز
      zid++;
    } catch (err) {
      failed++;
      console.error(`⚠️ تعذّر تجديد رموز زد للمستأجر ${row.tenantId}:`, err instanceof Error ? err.message : err);
    }
  }
  return { salla, zid, failed };
}

const worker = new Worker("integration-token-maintenance", async () => runIntegrationTokenMaintenance(), { connection: redisConnection, concurrency: 1 });
worker.on("completed", (_job, r) => {
  if (r && (r.salla || r.zid || r.failed)) console.log(`🔑 صيانة رموز المتاجر: سلة ${r.salla}، زد ${r.zid}، فشل ${r.failed}`);
});
worker.on("failed", (_job, err) => console.error("❌ فشلت صيانة رموز المتاجر:", err.message));

const queue = new Queue("integration-token-maintenance", { connection: redisConnection });
queue
  .add("scan", {}, { repeat: { every: INTERVAL_MS }, jobId: "recurring-integration-token-maintenance" })
  .catch((err) => console.error("❌ تعذّرت جدولة صيانة رموز المتاجر:", err));
