import { superAdminDb } from "@/lib/db";

/**
 * يُستدعى دورياً من queue/worker.ts (كل 5 دقائق، نفس تردد TRIGGER_SCAN_INTERVAL_MS للحملات الآلية):
 * (1) يفعّل أي إعلان SCHEDULED حان وقته (scheduledFor <= الآن) → SENT.
 * (2) يُنهي صلاحية أي إعلان SENT تجاوز expiresAt → EXPIRED (يختفي من لوحة التاجر تلقائياً).
 */
export async function scanAnnouncementLifecycle(): Promise<{ activated: number; expired: number }> {
  const now = new Date();
  const activated = await superAdminDb.platformAnnouncement.updateMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    data: { status: "SENT", sentAt: now },
  });
  const expired = await superAdminDb.platformAnnouncement.updateMany({
    where: { status: "SENT", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  return { activated: activated.count, expired: expired.count };
}
