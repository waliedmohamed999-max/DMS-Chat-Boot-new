import type { Prisma, Plan } from "@prisma/client";
import { parseChatbotLimits } from "@/lib/planLimits";

export type DowngradeCheckResult = { allowed: true } | { allowed: false; reasons: string[] };

/**
 * يمنع التخفيض لباقة أقل لو تجاوز الاستخدام الحالي حدودها فعلياً — فحص حي ضد القاعدة، وليس افتراضاً.
 * يُشغَّل قبل أي تنفيذ فعلي للتخفيض (بند 3 في البرومنت).
 */
export async function checkDowngradeAllowed(tx: Prisma.TransactionClient, tenantId: string, targetPlan: Plan): Promise<DowngradeCheckResult> {
  const reasons: string[] = [];

  const [activeUserCount, connectedWhatsappCount, publishedFlowCount] = await Promise.all([
    tx.user.count({ where: { tenantId, isActive: true } }),
    tx.integration.count({ where: { tenantId, provider: { in: ["META_WHATSAPP", "WHATSAPP_QR"] }, status: "CONNECTED" } }),
    tx.chatbotFlow.count({ where: { tenantId, status: "PUBLISHED" } }),
  ]);

  if (targetPlan.maxUsers >= 0 && activeUserCount > targetPlan.maxUsers) {
    reasons.push(`لديك ${activeUserCount} عضو فريق نشط، والباقة الجديدة تسمح بحد أقصى ${targetPlan.maxUsers} — عطّل عضواً أولاً من "الفريق والإعدادات".`);
  }
  if (targetPlan.maxWhatsappNumbers >= 0 && connectedWhatsappCount > targetPlan.maxWhatsappNumbers) {
    reasons.push(`لديك ${connectedWhatsappCount} رقم واتساب مربوط فعلياً، والباقة الجديدة تسمح بحد أقصى ${targetPlan.maxWhatsappNumbers} — افصل رقماً أولاً من "التكاملات".`);
  }

  const targetChatbotLimits = parseChatbotLimits(targetPlan.chatbotLimitsJson);
  if (targetChatbotLimits.maxActiveFlows >= 0 && publishedFlowCount > targetChatbotLimits.maxActiveFlows) {
    reasons.push(`لديك ${publishedFlowCount} تدفق شات بوت منشور، والباقة الجديدة تسمح بحد أقصى ${targetChatbotLimits.maxActiveFlows} — ألغِ نشر تدفق أولاً.`);
  }

  return reasons.length > 0 ? { allowed: false, reasons } : { allowed: true };
}
