import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";
import { AI_TOOLS } from "@/lib/ai/tools";
import { checkDeterministicHandoff } from "@/lib/ai/handoffRules";
import { buildSystemPrompt, getOrCreateAiAgentConfig } from "@/lib/ai/aiAgentConfig";
import { parseChatbotLimits } from "@/lib/planLimits";
import { checkTenantRateLimit, checkIpRateLimit } from "@/lib/rateLimit";
import { brainReply, runAgentLoop, type AiReplyResult, type ChatHistoryMessage } from "@/lib/ai/generateReply";
import { consultBrain } from "@/lib/ai/brain/context";

const SESSION_RATE_LIMIT = 15; // نفس حد الجلسة الواحدة في generatePlatformChatReply.ts
const SESSION_RATE_WINDOW_SECONDS = 60;
const TENANT_RATE_LIMIT = 20; // نفس AI_REPLY_RATE_LIMIT في generateReply.ts — نفس ميزانية الرد الذكي لكل تاجر
const TENANT_RATE_WINDOW_SECONDS = 60;

// أدوات الموظف الذكي التاجرية بدون get_order_status — الزائر على موقع التاجر مجهول الهوية بالكامل في
// هذه النسخة الأولى (لا contactId حقيقي)، فلا يمكن تنفيذ هذه الأداة أصلاً (راجع تعليق TenantChatSession
// في schema.prisma وقرار النطاق الصريح في البرومنت الأصلي لهذه الميزة).
const WEBSITE_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = AI_TOOLS.filter(
  (t): t is OpenAI.Chat.Completions.ChatCompletionFunctionTool => t.type === "function" && t.function.name !== "get_order_status"
);

/**
 * محرك رد الموظف الذكي لويدجت شات موقع التاجر الخاص — نفس بنية generateAiEmployeeReply (طبقات حماية
 * قبل أي استدعاء LLM: تفعيل صريح، بوابة باقة، تحويل حتمي بكلمات مفتاحية، حدود معدل، حصة توكنز) لكن
 * لزائر مجهول الهوية بلا contactId/conversationId حقيقيين (بند 1 في البرومنت الأصلي: لا get_order_status
 * في هذه القناة). يُستدعى من lib/tenantChat.ts داخل withTenant() دائماً.
 */
export async function generateWebsiteChatReply(params: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  sessionId: string;
  tenantName: string;
  history: ChatHistoryMessage[]; // آخر رسائل الجلسة المُنسَّقة، الأحدث أخيراً — تتضمن رسالة الزائر الحالية
  lastUserText: string;
}): Promise<AiReplyResult> {
  const { tx, tenantId, sessionId, tenantName, history, lastUserText } = params;

  // 0) مفتاحا تشغيل صريحان يتحكم بهما التاجر نفسه: الموظف الذكي عموماً، ثم ويدجت الموقع تحديداً —
  // كلاهما منفصل عن بوابة الباقة أدناه.
  const config = await getOrCreateAiAgentConfig(tx, tenantId);
  if (!config.enabled) {
    return { kind: "handoff", reason: "لم يُفعِّل التاجر الموظف الذكي بعد" };
  }
  if (!config.websiteWidgetActive) {
    return { kind: "handoff", reason: "لم يُفعِّل التاجر ويدجت شات الموقع بعد" };
  }

  // 1) بوابة الباقة — websiteChatEnabled يتحكم بالقدرة الكاملة على استخدام هذه القناة.
  const subscription = await tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
  const limits = parseChatbotLimits(subscription?.plan.chatbotLimitsJson);
  if (!limits.websiteChatEnabled) {
    return { kind: "handoff", reason: "ويدجت شات الموقع غير متاح في باقة التاجر الحالية" };
  }

  // 2) تحويل حتمي بكلمات مفتاحية — نفس الفحص التاجري/العام بالحرف.
  const deterministic = checkDeterministicHandoff(lastUserText);
  if (deterministic.shouldHandoff) {
    return { kind: "handoff", reason: deterministic.reason };
  }

  // 3) حد مزدوج: لكل جلسة زائر على حدة، ثم سقف عام لكل تاجر (نفس ميزانية الرد الذكي التاجرية على واتساب).
  const sessionLimit = await checkIpRateLimit(sessionId, "website-chat-session", SESSION_RATE_LIMIT, SESSION_RATE_WINDOW_SECONDS);
  if (!sessionLimit.allowed) {
    return { kind: "handoff", reason: "تجاوزت الحد الأقصى المؤقت لعدد الرسائل في هذه المحادثة — تحويل مؤقت لفريق المتجر" };
  }
  const tenantLimit = await checkTenantRateLimit(tenantId, "website-chat-ai-reply", TENANT_RATE_LIMIT, TENANT_RATE_WINDOW_SECONDS);
  if (!tenantLimit.allowed) {
    return { kind: "handoff", reason: "تجاوز الحد الأقصى المؤقت لعدد ردود الذكاء الاصطناعي — تحويل مؤقت لفريق المتجر" };
  }

  // 4) عقل البوت: إجابة معتمدة جاهزة ⇒ بلا نموذج ولا توكنز.
  const brain = await consultBrain(tx, tenantId, lastUserText, { allowDirect: config.directAnswers });
  if (brain.direct) return brainReply(brain.direct.answer);

  // 5) حد توكنز الباقة الشهري — نفس حصة الموظف الذكي على واتساب بالضبط (ميزانية LLM واحدة للتاجر).
  if (subscription) {
    if (limits.maxAiTokensPerMonth >= 0 && subscription.aiTokensUsedThisPeriod >= limits.maxAiTokensPerMonth) {
      return { kind: "handoff", reason: "تم استهلاك كامل حصة توكنز الذكاء الاصطناعي لهذا الشهر — تحويل لفريق المتجر" };
    }
  }

  // 6) النموذج — contactId فارغ عمداً: لا هوية حقيقية لزائر موقع التاجر، وWEBSITE_TOOLS تستبعد get_order_status.
  return runAgentLoop({
    tx, tenantId, contactId: "",
    systemPrompt: buildSystemPrompt(config, tenantName, "موقع المتجر الإلكتروني"),
    history,
    contextMessage: brain.contextMessage,
    tools: WEBSITE_TOOLS,
    knowledgeUsed: brain.knowledgeUsed,
    respondedNote: "تم إرسال الرد للزائر.",
  });
}
