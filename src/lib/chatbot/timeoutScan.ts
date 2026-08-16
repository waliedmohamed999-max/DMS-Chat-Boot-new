import { superAdminDb } from "@/lib/db";
import { withTenant } from "@/lib/db";

/** أي محادثة واقفة عند عقدة "سؤال" لأكثر من هذه المدة بلا رد من العميل تُعتبَر عالقة وتُصفَّر تلقائياً. */
const STUCK_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * فحص دوري عبر كل المستأجرين (نفس نمط scanAllTenantsTriggeredCampaigns) — يعيد أي محادثة بوت واقفة
 * منذ وقت طويل عند عقدة "سؤال" بلا رد إلى تحكّم بشري، بدل بقائها عالقة صامتة للأبد بلا أي إشعار.
 */
export async function scanAndResetStuckChatbotSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_SESSION_TIMEOUT_MS);
  const stuck = await superAdminDb.conversation.findMany({
    where: { controlMode: "BOT", currentNodeId: { not: null }, flowNodeEnteredAt: { lt: cutoff } },
    select: { id: true, tenantId: true },
  });

  for (const { id, tenantId } of stuck) {
    try {
      await withTenant(tenantId, (tx) =>
        tx.conversation.update({
          where: { id },
          data: { controlMode: "HUMAN", activeFlowId: null, currentNodeId: null, flowNodeEnteredAt: null },
        })
      );
    } catch (err) {
      console.error(`❌ فشل تصفير جلسة شات بوت عالقة للمستأجر ${tenantId}:`, err instanceof Error ? err.message : err);
    }
  }
}
