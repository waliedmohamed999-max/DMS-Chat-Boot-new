import { IntegrationProvider } from "@prisma/client";
import { isSandboxMode } from "@/lib/integrations/types";
import { SANDBOX_TEMPLATE_REJECTION_REASONS } from "@/lib/integrations/fixtures";
import { decryptSecret } from "@/lib/crypto";
import { withTenant } from "@/lib/db";
import { scheduleTemplateReviewDecision } from "@/lib/queue/templateStatusQueue";

export type TemplateButtonInput = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; value?: string };
export type CreateTemplateInput = {
  name: string; category: string; language: string;
  headerType?: string; headerText?: string;
  bodyText: string; footerText?: string;
  buttons?: TemplateButtonInput[];
};

/**
 * يرسل القالب فعلياً لمراجعة Meta عبر Graph API الحقيقي (`POST /{waba-id}/message_templates`)
 * حين يوجد اتصال حقيقي، أو يحاكي نفس السلوك في Sandbox (معرّف وهمي + قرار مؤجَّل واقعي عبر
 * lib/queue/templateStatusQueue.ts) — الحالة الأولية PENDING في الحالتين دائماً، لا اعتماد فوري.
 */
export async function submitTemplateForApproval(
  tenantId: string,
  templateDbId: string,
  input: CreateTemplateInput
): Promise<{ externalTemplateId: string }> {
  if (await isSandboxMode()) {
    const externalTemplateId = `sandbox-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await scheduleTemplateReviewDecision(tenantId, templateDbId);
    return { externalTemplateId };
  }

  const integration = await withTenant(tenantId, (tx) =>
    tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.META_WHATSAPP } } })
  );
  if (!integration?.encryptedAccessToken || integration.status !== "CONNECTED") {
    throw new Error("لا يوجد رقم واتساب مربوط فعلياً لهذا التاجر — اربط الحساب أولاً من صفحة التكاملات.");
  }
  const wabaId = (integration.metadataJson as { wabaId?: string } | null)?.wabaId;
  if (!wabaId) throw new Error("معرّف WABA غير متوفر — أعد ربط الحساب من صفحة التكاملات.");

  const accessToken = decryptSecret(integration.encryptedAccessToken);
  const components: Record<string, unknown>[] = [];
  if (input.headerType && input.headerType !== "NONE") {
    components.push({ type: "HEADER", format: input.headerType, text: input.headerType === "TEXT" ? input.headerText : undefined });
  }
  components.push({ type: "BODY", text: input.bodyText });
  if (input.footerText) components.push({ type: "FOOTER", text: input.footerText });
  if (input.buttons?.length) components.push({ type: "BUTTONS", buttons: input.buttons });

  const res = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, category: input.category, language: input.language, components }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message ?? "فشل إرسال القالب لمراجعة Meta.");
  }
  return { externalTemplateId: data.id };
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
