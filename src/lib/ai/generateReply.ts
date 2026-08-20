import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";
import { getOpenAiClient } from "@/lib/ai/openaiClient";
import { AI_TOOLS, executeAiTool } from "@/lib/ai/tools";
import { checkDeterministicHandoff, isRepeatedUnresolvedQuestion } from "@/lib/ai/handoffRules";
import { buildSystemPrompt, getOrCreateAiAgentConfig } from "@/lib/ai/aiAgentConfig";
import { checkTenantRateLimit } from "@/lib/rateLimit";

const AI_REPLY_RATE_LIMIT = 20; // 20 استدعاء ذكاء اصطناعي كحد أقصى لكل تاجر كل دقيقة
const AI_REPLY_RATE_WINDOW_SECONDS = 60;
const MAX_TOOL_ITERATIONS = 6; // حد أقصى لدورات استدعاء الأدوات لمنع حلقة استدعاء لا نهائية — محادثة بيع فيها مقارنة منتجين + اعتراض + رد نهائي قد تحتاج دورات أكتر من رد خدمة عملاء بسيط

export type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type AiReplyResult =
  | { kind: "handoff"; reason: string; model?: string; usage?: TokenUsage }
  | { kind: "reply"; text: string; confidence: number; model: string; usage: TokenUsage; usedTool: string | null };

/** الأداة النهائية الإلزامية — النموذج يستخدمها دائماً لإرسال ردّه الفعلي مع تقييم ثقته وقراره بالتحويل،
 * بدل الاعتماد على تحليل نص حر أو JSON mode منفصل (بند 6 في البرومنت: مؤشر ثقة لكل رد). */
const RESPOND_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "respond_to_customer",
    description: "استخدمها دائماً كخطوتك الأخيرة لإرسال ردّك للعميل مع تقييم ثقتك وقرارك بشأن التحويل لموظف بشري.",
    parameters: {
      type: "object",
      properties: {
        reply: { type: "string", description: "نص الرد الذي سيصل للعميل مباشرة عبر واتساب (فارغ إن needsHuman=true)" },
        confidence: { type: "integer", description: "ثقتك بأن هذا الرد يحل استفسار العميل فعلاً، من 0 إلى 100" },
        needsHuman: { type: "boolean", description: "true فقط لو يجب تحويل هذه المحادثة لموظف بشري بدل إرسال reply" },
        handoffReason: { type: "string", description: "سبب مختصر للتحويل، إلزامي فقط لو needsHuman=true" },
      },
      required: ["reply", "confidence", "needsHuman"],
    },
  },
};

export type ChatHistoryMessage = { role: "user" | "assistant"; content: string };

/**
 * محرك توليد رد الموظف الذكي — نقطة الدخول الوحيدة التي تستدعي مزوّد الذكاء الاصطناعي فعلياً (بند 1
 * في البرومنت). تُنفَّذ عدة طبقات حماية **قبل** أي استدعاء LLM فعلي (بالترتيب): تحويل حتمي بكلمات
 * مفتاحية، سؤال متكرر بلا حل، حد معدل الاستدعاء، حد توكنز الباقة الشهري — كل هذه توفّر تكلفة وزمناً
 * وتضمن تطبيق قواعد التحويل بصرامة بصرف النظر عن سلوك النموذج نفسه في تلك اللحظة.
 */
export async function generateAiEmployeeReply(params: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  conversationId: string;
  contactId: string;
  tenantName: string;
  history: ChatHistoryMessage[]; // آخر 10-15 رسالة مُنسَّقة، الأحدث أخيراً — تتضمن رسالة العميل الحالية
  lastUserText: string;
}): Promise<AiReplyResult> {
  const { tx, tenantId, conversationId, contactId, tenantName, history, lastUserText } = params;

  // 0) مفتاح تشغيل/إيقاف صريح يتحكم به التاجر نفسه (منفصل عن بوابة الباقة) — لو لم يُفعِّله بعد،
  // تحويل فوري بلا أي استدعاء إضافي (لا داعي لفحص كلمات مفتاحية أو حدود قبل التأكد أنه مفعَّل أصلاً).
  const config = await getOrCreateAiAgentConfig(tx, tenantId);
  if (!config.enabled) {
    return { kind: "handoff", reason: "لم يُفعِّل التاجر الموظف الذكي بعد من صفحة الإعدادات" };
  }

  // 1) تحويل حتمي بكلمات مفتاحية — قبل أي شيء آخر، بلا استثناء.
  const deterministic = checkDeterministicHandoff(lastUserText);
  if (deterministic.shouldHandoff) {
    return { kind: "handoff", reason: deterministic.reason };
  }

  // 2) سؤال متكرر 3 مرات بلا حل — يُفحَص ضد آخر سجلات هذه المحادثة تحديداً.
  const recentLogs = await tx.aiReplyLog.findMany({
    where: { conversationId }, orderBy: { createdAt: "desc" }, take: 5, select: { userMessage: true },
  });
  if (isRepeatedUnresolvedQuestion(recentLogs.map((l) => l.userMessage), lastUserText)) {
    return { kind: "handoff", reason: "نفس السؤال تكرر 3 مرات دون التوصل لحل" };
  }

  // 3) حد معدل الاستدعاء لكل تاجر — حماية من إساءة استخدام/تكلفة غير متوقعة.
  const rateLimit = await checkTenantRateLimit(tenantId, "ai-reply", AI_REPLY_RATE_LIMIT, AI_REPLY_RATE_WINDOW_SECONDS);
  if (!rateLimit.allowed) {
    return { kind: "handoff", reason: "تجاوز الحد الأقصى المؤقت لعدد ردود الذكاء الاصطناعي — تحويل مؤقت لموظف بشري" };
  }

  // 4) حد توكنز الباقة الشهري.
  const subscription = await tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
  if (subscription) {
    const limitsRaw = subscription.plan.chatbotLimitsJson as { maxAiTokensPerMonth?: number } | null;
    const maxTokens = typeof limitsRaw?.maxAiTokensPerMonth === "number" ? limitsRaw.maxAiTokensPerMonth : 0;
    if (maxTokens >= 0 && subscription.aiTokensUsedThisPeriod >= maxTokens) {
      return { kind: "handoff", reason: "تم استهلاك كامل حصة توكنز الذكاء الاصطناعي لهذا الشهر — تحويل لموظف بشري" };
    }
  }

  // 5) مزوّد الذكاء الاصطناعي نفسه — بلا مفتاح مُعدّ، تحويل صادق بدل خطأ أو رد وهمي.
  const openai = await getOpenAiClient();
  if (!openai) {
    return { kind: "handoff", reason: "لم يُضبَط مزوّد الذكاء الاصطناعي بعد من إعدادات المنصة" };
  }

  const systemPrompt = buildSystemPrompt(config, tenantName);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({ role: m.role, content: m.content })),
  ];

  const tools = [...AI_TOOLS, RESPOND_TOOL];
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
    // نوعا نداء أداة في نسخة OpenAI SDK الحالية: "function" (ما نستخدمه حصراً هنا) و"custom" —
    // نفلتر لنوع function فقط قبل الوصول لحقل .function (غير موجود على النوع الآخر أصلاً).
    const toolCalls = message.tool_calls?.filter(
      (t): t is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => t.type === "function"
    );

    if (!toolCalls || toolCalls.length === 0) {
      // النموذج لم يستخدم respond_to_customer كما طُلِب منه — يُعامَل نص رده مباشرة كرد احتياطي
      // بثقة متوسطة بدل تجاهل رد فعلي وصل من النموذج.
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
        // نتيجة أداة صورية لإكمال بنية الرسائل (كل tool_call يجب أن يقابله رد tool) — لا تُستخدَم فعلياً.
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: "تم إرسال الرد للعميل." });
      } else {
        usedTool = toolCall.function.name;
        const result = await executeAiTool(tx, tenantId, contactId, toolCall.function.name, toolCall.function.arguments);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
      }
    }

    if (finalAnswer) return finalAnswer;
    // لا respond_to_customer في هذه الدورة — تابع الحلقة لإعطاء النموذج نتائج الأدوات ليكمل تفكيره.
  }

  // استُنفدت المحاولات بلا رد نهائي حاسم — تحويل آمن بدل تخمين أو حلقة لا نهائية.
  return { kind: "handoff", reason: "تعذّر التوصل لرد نهائي بعد عدة محاولات استدعاء أدوات", model: openai.model, usage };
}
