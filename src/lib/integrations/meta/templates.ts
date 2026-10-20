import { SANDBOX_TEMPLATE_REJECTION_REASONS } from "@/lib/integrations/fixtures";
import { withTenant } from "@/lib/db";
import { scheduleTemplateReviewDecision } from "@/lib/queue/templateStatusQueue";
import { resolveTemplateChannel, submitTemplateToChannel, type TemplateInput } from "@/lib/integrations/templateChannel";

export type { TemplateButtonInput } from "@/lib/integrations/templateChannel";
export type CreateTemplateInput = TemplateInput;

/**
 * يرسل القالب لمراجعة واتساب عبر القناة الفعلية للتاجر (lib/integrations/templateChannel.ts): 360dialog
 * أولاً، ثم Meta المباشر، أو يحاكي القرار في Sandbox (معرّف وهمي + قرار مؤجَّل عبر
 * lib/queue/templateStatusQueue.ts). الحالة الأولية PENDING دائماً — لا اعتماد فوري.
 */
export async function submitTemplateForApproval(
  tenantId: string,
  templateDbId: string,
  input: CreateTemplateInput
): Promise<{ externalTemplateId: string }> {
  const channel = await resolveTemplateChannel(tenantId);
  if (channel.kind === "sandbox") {
    const externalTemplateId = `sandbox-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await scheduleTemplateReviewDecision(tenantId, templateDbId);
    return { externalTemplateId };
  }
  return submitTemplateToChannel(channel, input);
}

/** يطبّق قرار مراجعة (فعلي من webhook أو محاكى من الطابور) على قالب مخزَّن، داخل transaction قائمة. */
export async function applyTemplateDecisionTx(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  templateId: string,
  event: "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED",
  reason?: string | null
): Promise<void> {
  await tx.messageTemplate.update({
    where: { id: templateId },
    data: {
      status: event,
      rejectionReason: event === "REJECTED" || event === "PAUSED" ? reason ?? "لم يُحدَّد سبب" : null,
      decidedAt: new Date(),
    },
  });
}

/** نفس المنطق أعلاه لكن يفتح transaction خاصة به — يُستخدم من عامل BullMQ الذي لا يملك tx قائمة أصلاً. */
export async function applyTemplateDecision(
  tenantId: string,
  templateId: string,
  event: "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED",
  reason?: string | null
): Promise<void> {
  await withTenant(tenantId, (tx) => applyTemplateDecisionTx(tx, templateId, event, reason));
}

/** محاكاة قرار مراجعة واقعي في Sandbox: ~70% اعتماد، ~30% رفض بسبب واقعي متنوع. */
export function simulateTemplateDecision(): { event: "APPROVED" | "REJECTED"; reason?: string } {
  if (Math.random() < 0.7) return { event: "APPROVED" };
  const reason = SANDBOX_TEMPLATE_REJECTION_REASONS[Math.floor(Math.random() * SANDBOX_TEMPLATE_REJECTION_REASONS.length)]!;
  return { event: "REJECTED", reason };
}
