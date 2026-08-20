import { rawDb } from "@/lib/db";
import { generatePlatformChatReply } from "@/lib/ai/generatePlatformChatReply";
import type { ChatHistoryMessage } from "@/lib/ai/generateReply";

const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_LIMIT = 15;
const STATIC_HANDED_OFF_REPLY = "تم تحويل محادثتك لفريق الدعم، سيردون عليك قريباً";

export type PlatformChatMessageResult =
  | { kind: "error"; message: string; status: number }
  | { kind: "static"; replyText: string; sessionStatus: "HANDED_OFF" | "CLOSED" }
  | { kind: "handoff"; replyText: null; sessionStatus: "HANDED_OFF" }
  | { kind: "ai"; replyText: string; sessionStatus: "OPEN" };

/**
 * منطق مشترك بين /api/platform-chat/message و/api/platform-chat/voice (الأخيرة تُفرِّغ الصوت لنص أولاً
 * ثم تستدعي نفس هذه الدالة بالضبط) — نقطة واحدة تخزّن رسالة الزائر، تفحص حالة الجلسة، وتستدعي محرك
 * الذكاء الاصطناعي أو تُرجع رداً ثابتاً لو الجلسة مُحوَّلة/مُغلقة فعلاً.
 */
export async function processPlatformChatMessage(sessionId: string, rawText: string, wasVoice: boolean): Promise<PlatformChatMessageResult> {
  const text = rawText.trim();
  if (!text) return { kind: "error", message: "نص الرسالة فارغ", status: 400 };
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { kind: "error", message: `النص طويل جداً (الحد الأقصى ${MAX_MESSAGE_LENGTH} حرف)`, status: 400 };
  }

  const session = await rawDb.platformChatSession.findUnique({ where: { id: sessionId } });
  if (!session) return { kind: "error", message: "جلسة محادثة غير موجودة", status: 404 };

  // رسالة الزائر تُخزَّن دائماً بصرف النظر عن حالة الجلسة — أثر حقيقي حتى لو الرد بعدها ثابت.
  await rawDb.platformChatMessage.create({ data: { sessionId, senderType: "VISITOR", text, wasVoice } });
  await rawDb.platformChatSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });

  if (session.status !== "OPEN") {
    return { kind: "static", replyText: STATIC_HANDED_OFF_REPLY, sessionStatus: session.status };
  }

  const recentMessages = await rawDb.platformChatMessage.findMany({
    where: { sessionId }, orderBy: { createdAt: "desc" }, take: HISTORY_LIMIT,
  });
  const history: ChatHistoryMessage[] = recentMessages
    .reverse()
    .map((m) => ({ role: m.senderType === "VISITOR" ? "user" : "assistant", content: m.text }));

  const result = await rawDb.$transaction((tx) => generatePlatformChatReply({ tx, sessionId, history, lastUserText: text }));

  if (result.kind === "handoff") {
    await rawDb.platformChatSession.update({ where: { id: sessionId }, data: { status: "HANDED_OFF" } });
    return { kind: "handoff", replyText: null, sessionStatus: "HANDED_OFF" };
  }

  await rawDb.platformChatMessage.create({ data: { sessionId, senderType: "AI", text: result.text } });
  await rawDb.platformChatSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });
  return { kind: "ai", replyText: result.text, sessionStatus: "OPEN" };
}
