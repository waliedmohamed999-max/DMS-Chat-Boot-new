import { superAdminDb } from "@/lib/db";
import { stopSession } from "@/lib/integrations/whatsappQr/sessionManager";

const TRIAL_EXPIRED_MESSAGE = "انتهت مدة القناة التجريبية (3 أيام) — يرجى ربط واتساب رسمياً عبر Meta للاستمرار";

/**
 * فحص دوري عبر كل المستأجرين (نفس نمط scanAllTenantsTriggeredCampaigns في lib/campaigns/
 * triggerEngine.ts) — يقطع أي جلسة QR تجريبية تجاوزت مدة صلاحيتها ويمسح بيانات اعتمادها نهائياً.
 */
export async function scanAndExpireQrTrials(): Promise<void> {
  const expired = await superAdminDb.integration.findMany({
    where: { provider: "WHATSAPP_QR", status: "CONNECTED", qrTrialExpiresAt: { lt: new Date() } },
    select: { tenantId: true },
  });

  for (const { tenantId } of expired) {
    try {
      await stopSession(tenantId, TRIAL_EXPIRED_MESSAGE);
    } catch (err) {
      console.error(`❌ فشل إنهاء القناة التجريبية المنتهية للمستأجر ${tenantId}:`, err);
    }
  }
}
