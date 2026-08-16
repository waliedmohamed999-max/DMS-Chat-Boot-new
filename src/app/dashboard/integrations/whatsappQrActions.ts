"use server";

import qrcode from "qrcode";
import { requireTenantSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { whatsappQrStartQueue } from "@/lib/integrations/whatsappQr/queue";
import { getQrStatus } from "@/lib/integrations/whatsappQr/redisStatus";

export type WhatsappQrTrialStatus = {
  state: "waiting_scan" | "connected" | "disconnected" | "error";
  qrDataUrl?: string;
  connectedPhoneE164?: string;
  error?: string;
};

/** يرسل أمر "ابدأ" لعملية العامل (لا ينتظر الاتصال الفعلي — العميل يستطلع الحالة بعدها بـgetWhatsappQrStatusAction). */
export async function startWhatsappQrTrialAction(): Promise<void> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "integrations.manage");

  await whatsappQrStartQueue.add("start", { tenantId: session.user.tenantId });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "integration.whatsapp_qr_trial_start",
    targetType: "Integration",
    targetId: "WHATSAPP_QR",
  });
}

export async function getWhatsappQrStatusAction(): Promise<WhatsappQrTrialStatus> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "integrations.manage");

  const status = await getQrStatus(session.user.tenantId);
  if (!status) return { state: "disconnected" };

  const qrDataUrl = status.qr ? await qrcode.toDataURL(status.qr) : undefined;
  return {
    state: status.state,
    qrDataUrl,
    connectedPhoneE164: status.connectedPhoneE164,
    error: status.error,
  };
}
