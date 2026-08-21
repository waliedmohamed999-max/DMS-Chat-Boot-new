import { withTenant } from "@/lib/db";
import { generateWebsiteChatReply } from "@/lib/ai/generateWebsiteChatReply";
import type { ChatHistoryMessage } from "@/lib/ai/generateReply";

const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_LIMIT = 15;
const STATIC_HANDED_OFF_REPLY = "تم تحويل محادثتك لفريق المتجر، سيردون عليك قريباً";

export type TenantChatMessageResult =
  | { kind: "error"; message: string; status: number }
  | { kind: "static"; replyText: string; sessionStatus: "HANDED_OFF" | "CLOSED" }
  | { kind: "handoff"; replyText: null; sessionStatus: "HANDED_OFF" }
  | { kind: "ai"; replyText: string; sessionStatus: "OPEN" };

/**
 * منطق مشترك بين /api/tenant-chat/[tenantId]/message و/voice — نظير processPlatformChatMessage تماماً
 * في البنية، لكن يعمل بالكامل داخل withTenant() لأن TenantChatSession/TenantChatMessage بيانات تاجر
 * حقيقية خاضعة لـRLS (خلافاً لـPlatformChatSession/Message التي تُقرأ عبر rawDb). يزيد عدّاد توكنز
 * الباقة الشهري لنفس Subscription الذي يستهلكه الموظف الذكي على واتساب (ميزانية LLM واحدة للتاجر عبر
 * كل القنوات، بنفس نمط الزيادة في lib/chatbot/engine.ts سطر ~158).
 */
export async function processTenantChatMessage(
  tenantId: string,
  sessionId: string,
  rawText: string,
  wasVoice: boolean
): Promise<TenantChatMessageResult> {
  const text = rawText.trim();
  if (!text) return { kind: "error", message: "نص الرسالة فارغ", status: 400 };
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { kind: "error", message: `النص طويل جداً (الحد الأقصى ${MAX_MESSAGE_LENGTH} حرف)`, status: 400 };
  }

  return withTenant(tenantId, async (tx) => {
    // RLS يُرجع null بصمت لجلسة تعود لتاجر آخر (لا تسريب، لا حاجة لفحص tenantId يدوي إضافي).
    const session = await tx.tenantChatSession.findUnique({ where: { id: sessionId } });
    if (!session) return { kind: "error", message: "جلسة محادثة غير موجودة", status: 404 };

    // رسالة الزائر تُخزَّن دائماً بصرف النظر عن حالة الجلسة — أثر حقيقي حتى لو الرد بعدها ثابت.
    await tx.tenantChatMessage.create({ data: { tenantId, sessionId, senderType: "VISITOR", text, wasVoice } });
    await tx.tenantChatSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });

    if (session.status !== "OPEN") {
      return { kind: "static", replyText: STATIC_HANDED_OFF_REPLY, sessionStatus: session.status };
    }

    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

    const recentMessages = await tx.tenantChatMessage.findMany({
      where: { sessionId }, orderBy: { createdAt: "desc" }, take: HISTORY_LIMIT,
    });
    const history: ChatHistoryMessage[] = recentMessages
      .reverse()
      .map((m) => ({ role: (m.senderType === "VISITOR" ? "user" : "assistant") as "user" | "assistant", content: m.text }));

    const result = await generateWebsiteChatReply({
      tx, tenantId, sessionId, tenantName: tenant?.name ?? "المتجر", history, lastUserText: text,
    });

    const usage = result.usage;
    if (usage?.totalTokens) {
      await tx.subscription.updateMany({ where: { tenantId }, data: { aiTokensUsedThisPeriod: { increment: usage.totalTokens } } });
    }

    if (result.kind === "handoff") {
      await tx.tenantChatSession.update({ where: { id: sessionId }, data: { status: "HANDED_OFF" } });
      return { kind: "handoff", replyText: null, sessionStatus: "HANDED_OFF" };
    }

    await tx.tenantChatMessage.create({ data: { tenantId, sessionId, senderType: "AI", text: result.text } });
    await tx.tenantChatSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });
    return { kind: "ai", replyText: result.text, sessionStatus: "OPEN" };
  });
}
