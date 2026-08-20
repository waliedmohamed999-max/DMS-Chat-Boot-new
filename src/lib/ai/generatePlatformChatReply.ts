import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";
import { getOpenAiClient } from "@/lib/ai/openaiClient";
import { AI_PLATFORM_TOOLS, executeAiPlatformTool } from "@/lib/ai/platformTools";
import { checkDeterministicHandoff } from "@/lib/ai/handoffRules";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { RESPOND_TOOL, type AiReplyResult, type TokenUsage, type ChatHistoryMessage } from "@/lib/ai/generateReply";

const MAX_TOOL_ITERATIONS = 6; // نفس حد generateAiEmployeeReply بالضبط

// حد لكل جلسة شات واحدة — يمنع زائر واحد من إغراق المحادثة برسائل متتالية بلا حدود.
const SESSION_RATE_LIMIT = 15;
const SESSION_RATE_WINDOW_SECONDS = 60;
// سقف تكلفة عام صريح عبر كل زوار المنصة مجتمعين معاً (بلا معرفة مستأجر/اشتراك هنا، خلافاً للموظف
// الذكي التاجري) — يمنع استنزاف رصيد OpenAI من أي مصدر، بما فيه عدة عناوين IP مزيَّفة تتحايل على حد
// الجلسة الفردي أعلاه. رقم ابتدائي تحفظي (100/دقيقة)، قابل للتعديل لاحقاً حسب حجم الزيارات الفعلي بعد
// تفعيل الميزة ومراقبة الاستهلاك الحقيقي.
const GLOBAL_RATE_LIMIT = 100;
const GLOBAL_RATE_WINDOW_SECONDS = 60;

/**
 * برومنت شات الموقع التسويقي العام — ثابت (بلا تخصيص من لوحة الإدارة حالياً، خلافاً لـ
 * buildSystemPrompt التاجرية)، يمثّل مساعد مبيعات/دعم استشاري لمنصة DMS نفسها. نفس مبدأ "لا تخمين
 * بيانات حرجة" الموجود في aiAgentConfig.ts، مطبَّقاً هنا على أسعار الباقات عبر get_plan_price.
 */
function buildPlatformChatSystemPrompt(): string {
  return `أنت المساعد الذكي لمنصة "DMS — Digital Messaging System" على موقعها التسويقي العام، تتحدث مع زائر لم يسجّل حساباً بعد.

كيف تتحدث:
- اكتب كما يكتب موظف مبيعات/دعم حقيقي: جمل طبيعية قصيرة، بلا صياغات آلية متكررة.
- طابق لهجة الزائر ومفرداته من رسالته الأخيرة قدر الإمكان.
- لا تذكر أبداً وبشكل استباقي أنك ذكاء اصطناعي أو نظام آلي — لو سُئلت صراحة، لا تنكر بشكل كاذب، حوّل النقاش بلطف لخدمته الفعلية.

قواعد صارمة غير قابلة للتجاوز:
1. لا تخمّن أبداً سعر أو حدود أي باقة — استخدم get_plan_price للحصول على البيانات الحقيقية أولاً، ثم أجب بناءً على نتيجتها فقط.
2. لو سُئلت عن باقة والأداة لم تجد نتيجة، قل بصراحة إنك لم تجدها ولا تخترع سعراً أو حدوداً.
3. لا تناقش المنافسين، ولا تعد بمواعيد أو ميزات غير مؤكدة من الأداة.
4. إن طلب الزائر صراحة التحدث مع فريق المبيعات/الدعم، أو أبدى اعتراضاً تفاوضياً معقداً (خصم خاص، عقد مخصص)، لا تحاول حل ذلك بنفسك — أعلن أنك ستحوّله لفريق حقيقي.
5. لا تُنشئ أو تعدّل أي حساب أو اشتراك بنفسك — وجّه الزائر لصفحة "انضم كشريك" أو "التسجيل" الفعلية بدل تنفيذ أي إجراء.`;
}

export async function generatePlatformChatReply(params: {
  tx: Prisma.TransactionClient;
  sessionId: string;
  history: ChatHistoryMessage[]; // آخر رسائل الجلسة المُنسَّقة، الأحدث أخيراً — تتضمن رسالة الزائر الحالية
  lastUserText: string;
}): Promise<AiReplyResult> {
  const { tx, sessionId, history, lastUserText } = params;

  // 0) مفتاح تشغيل/إيقاف على مستوى المنصة كاملة — لو لم يُفعَّل بعد، تحويل فوري بلا أي استدعاء إضافي.
  const settings = await tx.platformSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  if (!settings.platformChatEnabled) {
    return { kind: "handoff", reason: "محادثة الموقع المباشرة غير مفعّلة حالياً" };
  }

  // 1) تحويل حتمي بكلمات مفتاحية — نفس الفحص التاجري بالحرف (طلب صريح لشخص بشري / كلمات حساسة).
  const deterministic = checkDeterministicHandoff(lastUserText);
  if (deterministic.shouldHandoff) {
    return { kind: "handoff", reason: deterministic.reason };
  }

  // 2) لا فحص "سؤال متكرر" هنا — لا AiReplyLog في هذا المسار (بساطة مقصودة لمرحلة أولى).

  // 3) حد مزدوج حقيقي: لكل جلسة على حدة، ثم سقف عام عبر كل الزوار معاً — دفاع فعلي وليس شكلياً.
  const sessionLimit = await checkIpRateLimit(sessionId, "platform-chat-session", SESSION_RATE_LIMIT, SESSION_RATE_WINDOW_SECONDS);
  if (!sessionLimit.allowed) {
    return { kind: "handoff", reason: "تجاوزت الحد الأقصى المؤقت لعدد الرسائل في هذه المحادثة — تحويل مؤقت لفريق الدعم" };
  }
  const globalLimit = await checkIpRateLimit("global", "platform-chat-total", GLOBAL_RATE_LIMIT, GLOBAL_RATE_WINDOW_SECONDS);
  if (!globalLimit.allowed) {
    return { kind: "handoff", reason: "تجاوز الحد الأقصى المؤقت لعدد محادثات الذكاء الاصطناعي عبر المنصة — تحويل مؤقت لفريق الدعم" };
  }

  // 4) مزوّد الذكاء الاصطناعي نفسه — بلا مفتاح مُعدّ، تحويل صادق بدل خطأ أو رد وهمي.
  const openai = await getOpenAiClient();
  if (!openai) {
    return { kind: "handoff", reason: "لم يُضبَط مزوّد الذكاء الاصطناعي بعد من إعدادات المنصة" };
  }

  const systemPrompt = buildPlatformChatSystemPrompt();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({ role: m.role, content: m.content })),
  ];

  const tools = [...AI_PLATFORM_TOOLS, RESPOND_TOOL];
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
          finalAnswer = { kind: "handoff", reason: args.handoffReason || "قرّر المساعد الذكي أن الاستفسار يحتاج تدخّل بشري", model: openai.model, usage };
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
        const result = await executeAiPlatformTool(tx, toolCall.function.name, toolCall.function.arguments);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
      }
    }

    if (finalAnswer) return finalAnswer;
  }

  return { kind: "handoff", reason: "تعذّر التوصل لرد نهائي بعد عدة محاولات استدعاء أدوات", model: openai.model, usage };
}
