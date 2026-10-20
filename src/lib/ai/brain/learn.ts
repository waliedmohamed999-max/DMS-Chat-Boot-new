import type { Prisma } from "@prisma/client";
import { invalidateBrainIndex } from "./search";

const SUGGESTION_WINDOW_MS = 48 * 3600 * 1000;
const MAX_PENDING = 200;

/**
 * التعلّم من الفريق: أول رد لموظف بشري بعد أن حوّل الموظف الذكي المحادثة = إجابة على سؤال لم يعرفه البوت.
 * يُحفظ "مقترحاً" (PENDING) لا يُستخدَم في أي رد حتى يوافق عليه صاحب الحساب — ردود الموظفين قد تكون شخصية
 * أو خاصة بعميل بعينه، فلا تدخل العقل تلقائياً.
 */
export async function suggestFromAgentReply(tx: Prisma.TransactionClient, tenantId: string, conversationId: string, body: string) {
  const answer = body.trim();
  if (answer.length < 10 || answer.length > 2000) return;
  const config = await tx.aiAgentConfig.findUnique({ where: { tenantId }, select: { enabled: true, learnFromAgents: true } });
  if (!config?.enabled || !config.learnFromAgents) return;

  const handoff = await tx.aiReplyLog.findFirst({
    where: { conversationId, handoffTriggered: true, createdAt: { gte: new Date(Date.now() - SUGGESTION_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { userMessage: true, createdAt: true },
  });
  const question = handoff?.userMessage.trim();
  if (!handoff || !question || question.length < 3) return;

  // أول رد بشري فقط بعد التحويل (الرسالة الحالية مُنشأة للتو ⇒ العدد 1).
  const agentReplies = await tx.message.count({ where: { conversationId, senderType: "AGENT", createdAt: { gt: handoff.createdAt } } });
  if (agentReplies > 1) return;

  if (await tx.knowledgeQa.findFirst({ where: { tenantId, question: question.slice(0, 500) }, select: { id: true } })) return;
  if ((await tx.knowledgeQa.count({ where: { tenantId, status: "PENDING" } })) >= MAX_PENDING) return;

  await tx.knowledgeQa.create({
    data: { tenantId, question: question.slice(0, 500), answer, origin: "FROM_AGENT", status: "PENDING" },
  });
  invalidateBrainIndex(tenantId);
}
