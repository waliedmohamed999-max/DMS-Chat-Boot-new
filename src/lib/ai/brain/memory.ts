import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";
import { getOpenAiClient } from "@/lib/ai/openaiClient";
import type { ChatHistoryMessage, TokenUsage } from "@/lib/ai/generateReply";

// ========================= ذاكرة العميل =========================

export const MAX_MEMORIES_PER_CONTACT = 30;

/** أداة يستدعيها النموذج لحفظ معلومة دائمة عن العميل (تُحدَّث القيمة لنفس المفتاح بدل تكرارها). */
export const REMEMBER_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "remember_customer_fact",
    description:
      "احفظ معلومة دائمة مفيدة عن هذا العميل لتتذكّرها في محادثات قادمة (مثال: المدينة، المقاس، اللون المفضّل، مناسبة الشراء، حساسية). لا تحفظ أبداً بيانات حساسة (أرقام بطاقات، كلمات مرور، هويات) ولا تفاصيل عابرة.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "اسم المعلومة بكلمة أو كلمتين بالإنجليزية (city, shoe_size, favorite_scent...)" },
        value: { type: "string", description: "القيمة كما قالها العميل باختصار" },
      },
      required: ["key", "value"],
    },
  },
};

const SENSITIVE = /(\b\d{12,19}\b|password|كلمة\s*(المرور|السر)|رقم\s*(البطاقة|الهوية|الإقامة)|cvv|iban)/i;

export async function rememberCustomerFact(tx: Prisma.TransactionClient, tenantId: string, contactId: string, rawArgs: string): Promise<string> {
  let args: { key?: unknown; value?: unknown } = {};
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return JSON.stringify({ saved: false, reason: "مدخلات غير صالحة" });
  }
  const key = String(args.key ?? "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  const value = String(args.value ?? "").trim().slice(0, 200);
  if (!key || !value) return JSON.stringify({ saved: false, reason: "مفتاح أو قيمة فارغة" });
  if (SENSITIVE.test(value) || SENSITIVE.test(key)) return JSON.stringify({ saved: false, reason: "بيانات حساسة لا تُحفظ" });

  const existing = await tx.contactMemory.findUnique({ where: { contactId_key: { contactId, key } }, select: { id: true } });
  if (!existing && (await tx.contactMemory.count({ where: { contactId } })) >= MAX_MEMORIES_PER_CONTACT) {
    return JSON.stringify({ saved: false, reason: "ذاكرة هذا العميل ممتلئة" });
  }
  await tx.contactMemory.upsert({
    where: { contactId_key: { contactId, key } },
    update: { value },
    create: { tenantId, contactId, key, value },
  });
  return JSON.stringify({ saved: true });
}

export async function loadContactMemory(tx: Prisma.TransactionClient, contactId: string): Promise<Array<{ key: string; value: string }>> {
  return tx.contactMemory.findMany({ where: { contactId }, orderBy: { updatedAt: "desc" }, take: MAX_MEMORIES_PER_CONTACT, select: { key: true, value: true } });
}

// ========================= ذاكرة المحادثة (ملخص بدل الرسائل القديمة) =========================

const KEEP_RECENT = 6; // آخر رسائل تُرسَل كاملة دائماً
const COMPACT_AT = 14; // عند تجاوز هذا العدد غير الملخَّص، يُلخَّص الأقدم

/**
 * يعيد سياق المحادثة المختصر: ملخص الأقدم + آخر الرسائل كاملة. يحدّث الملخص فقط حين تتراكم رسائل كثيرة
 * (استدعاء تلخيص قصير كل ~8 رسائل يوفّر إعادة إرسال كل الرسائل القديمة في كل رد).
 */
export async function compactConversation(
  tx: Prisma.TransactionClient,
  tenantId: string,
  conversationId: string
): Promise<{ history: ChatHistoryMessage[]; summary: string | null; usage: TokenUsage | null }> {
  const convo = await tx.conversation.findUnique({ where: { id: conversationId }, select: { aiSummary: true, aiSummaryUntil: true } });
  const rows = await tx.message.findMany({
    where: {
      tenantId, conversationId, senderType: { in: ["CONTACT", "BOT", "AGENT"] },
      ...(convo?.aiSummaryUntil ? { createdAt: { gt: convo.aiSummaryUntil } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { direction: true, body: true, createdAt: true },
  });
  const ordered = rows.reverse().filter((m) => (m.body ?? "").trim());
  const toHistory = (list: typeof ordered): ChatHistoryMessage[] =>
    list.map((m) => ({ role: m.direction === "INBOUND" ? "user" : "assistant", content: m.body ?? "" }));

  if (ordered.length <= COMPACT_AT) return { history: toHistory(ordered), summary: convo?.aiSummary ?? null, usage: null };

  const older = ordered.slice(0, ordered.length - KEEP_RECENT);
  const recent = ordered.slice(-KEEP_RECENT);
  const openai = await getOpenAiClient();
  if (!openai) return { history: toHistory(ordered.slice(-COMPACT_AT)), summary: convo?.aiSummary ?? null, usage: null };

  try {
    const transcript = older.map((m) => `${m.direction === "INBOUND" ? "العميل" : "المتجر"}: ${(m.body ?? "").slice(0, 500)}`).join("\n");
    const completion = await openai.client.chat.completions.create({
      model: openai.model,
      max_completion_tokens: 250,
      messages: [
        {
          role: "system",
          content:
            "لخّص محادثة خدمة عملاء في 3-6 أسطر عربية مختصرة للموظف الذي سيكمل المحادثة. احتفظ بكل التفاصيل العملية: المنتجات والأسعار المذكورة، الطلبات وأرقامها، ما طلبه العميل وما وُعد به، وأي مشكلة لم تُحل. بلا مقدمات.",
        },
        { role: "user", content: `${convo?.aiSummary ? `الملخص السابق:\n${convo.aiSummary}\n\n` : ""}الرسائل الجديدة:\n${transcript}` },
      ],
    });
    const summary = completion.choices[0]?.message.content?.trim();
    if (!summary) throw new Error("ملخص فارغ");
    await tx.conversation.update({ where: { id: conversationId }, data: { aiSummary: summary.slice(0, 2000), aiSummaryUntil: older.at(-1)!.createdAt } });
    const u = completion.usage;
    return {
      history: toHistory(recent),
      summary,
      usage: u ? { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens } : null,
    };
  } catch (err) {
    console.error("⚠️ تعذّر تلخيص المحادثة — تُرسل آخر الرسائل:", err instanceof Error ? err.message : err);
    return { history: toHistory(ordered.slice(-COMPACT_AT)), summary: convo?.aiSummary ?? null, usage: null };
  }
}
