import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";
import { getOpenAiClient } from "@/lib/ai/openaiClient";
import { AI_TOOLS, executeAiTool } from "@/lib/ai/tools";
import { checkDeterministicHandoff } from "@/lib/ai/handoffRules";
import { buildSystemPrompt, getOrCreateAiAgentConfig } from "@/lib/ai/aiAgentConfig";
import { parseChatbotLimits } from "@/lib/planLimits";
import { checkTenantRateLimit, checkIpRateLimit } from "@/lib/rateLimit";
import { RESPOND_TOOL, type AiReplyResult, type TokenUsage, type ChatHistoryMessage } from "@/lib/ai/generateReply";

const MAX_TOOL_ITERATIONS = 6; // نفس حد generateAiEmployeeReply/generatePlatformChatReply بالحرف
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

  // 4) حد توكنز الباقة الشهري — نفس حصة الموظف الذكي على واتساب بالضبط (ميزانية LLM واحدة للتاجر).
  if (subscription) {
    if (limits.maxAiTokensPerMonth >= 0 && subscription.aiTokensUsedThisPeriod >= limits.maxAiTokensPerMonth) {
      return { kind: "handoff", reason: "تم استهلاك كامل حصة توكنز الذكاء الاصطناعي لهذا الشهر — تحويل لفريق المتجر" };
    }
  }

  // 5) مزوّد الذكاء الاصطناعي نفسه.
  const openai = await getOpenAiClient();
  if (!openai) {
    return { kind: "handoff", reason: "لم يُضبَط مزوّد الذكاء الاصطناعي بعد من إعدادات المنصة" };
  }

  const systemPrompt = buildSystemPrompt(config, tenantName, "موقع المتجر الإلكتروني");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({ role: m.role, content: m.content })),
  ];

  const tools = [...WEBSITE_TOOLS, RESPOND_TOOL];
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let usedTool: string | null = null;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const completion = await openai.client.chat.completions.create({
      model: openai.model,
      messages,
      tools,
      tool_choice: "auto",
    });

    if (completion.usage) {
      usage.promptTokens += completion.usage.prompt_tokens;
      usage.completionTokens += completion.usage.completion_tokens;
      usage.totalTokens += completion.usage.total_tokens;
    }

    const choice = completion.choices[0];
    if (!choice) {
      return { kind: "handoff", reason: "لم يصل أي رد من مزوّد الذكاء الاصطناعي", model: openai.model, usage };
    }
    const message = choice.message;
    const toolCalls = message.tool_calls?.filter(
      (t): t is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => t.type === "function"
    );

    if (!toolCalls || toolCalls.length === 0) {
      return {
        kind: "reply", text: message.content?.trim() || "عذراً، لم أفهم طلبك تماماً — هل يمكنك التوضيح أكثر؟",
        confidence: 50, model: openai.model, usage, usedTool,
      };
    }

    messages.push(message);

    let finalAnswer: AiReplyResult | null = null;
    for (const toolCall of toolCalls) {
      if (toolCall.function.name === "respond_to_customer") {
        let args: { reply?: string; confidence?: number; needsHuman?: boolean; handoffReason?: string } = {};
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          // مخرجات غير صالحة من النموذج — تُعامَل كتحويل آمن بدل محاولة تخمين نية النموذج
        }
        if (args.needsHuman) {
          finalAnswer = { kind: "handoff", reason: args.handoffReason || "قرّر الموظف الذكي أن الاستفسار يحتاج تدخّل بشري", model: openai.model, usage };
        } else {
          finalAnswer = {
            kind: "reply", text: (args.reply || "").trim() || "عذراً، هل يمكنك توضيح طلبك أكثر؟",
            confidence: Math.max(0, Math.min(100, Math.round(args.confidence ?? 50))),
            model: openai.model, usage, usedTool,
          };
        }
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: "تم إرسال الرد للزائر." });
      } else {
        usedTool = toolCall.function.name;
        // contactId فارغ عمداً — لا هوية حقيقية لزائر موقع التاجر في هذه القناة، وWEBSITE_TOOLS
        // تستبعد الأداة الوحيدة (get_order_status) التي كانت لتحتاج contactId فعلياً.
        const result = await executeAiTool(tx, tenantId, "", toolCall.function.name, toolCall.function.arguments);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
      }
    }

    if (finalAnswer) return finalAnswer;
  }

  return { kind: "handoff", reason: "تعذّر التوصل لرد نهائي بعد عدة محاولات استدعاء أدوات", model: openai.model, usage };
}
