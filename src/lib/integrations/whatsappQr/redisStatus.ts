import { redisConnection } from "@/lib/queue/connection";

export type QrTrialStatus = {
  state: "waiting_scan" | "connected" | "disconnected" | "error";
  qr?: string;
  connectedPhoneE164?: string;
  error?: string;
};

function statusKey(tenantId: string): string {
  return `wa-qr:status:${tenantId}`;
}

/** حالة لحظية للاستطلاع (polling) من واجهة Next.js — تُكتب من عملية العامل، QR يتغيّر كل ~20-60 ثانية حتى المسح. */
export async function setQrStatus(tenantId: string, status: QrTrialStatus): Promise<void> {
  await redisConnection.set(statusKey(tenantId), JSON.stringify(status), "EX", 10 * 60);
}

export async function getQrStatus(tenantId: string): Promise<QrTrialStatus | null> {
  const raw = await redisConnection.get(statusKey(tenantId));
  return raw ? (JSON.parse(raw) as QrTrialStatus) : null;
}

export async function clearQrStatus(tenantId: string): Promise<void> {
  await redisConnection.del(statusKey(tenantId));
}
