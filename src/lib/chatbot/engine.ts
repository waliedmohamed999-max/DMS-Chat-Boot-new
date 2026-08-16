import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { resolveWhatsappAdapter } from "@/lib/integrations/registry";
import { computeWindowState } from "@/lib/inbox/windowState";
import { statusAfterOutboundReply } from "@/lib/inbox/conversationStatus";
import { findOutgoingEdge, matchesConditionKeywords, parseMenuBranches, matchMenuBranch, parseMessageAttachment } from "@/lib/chatbot/simulate";
import { START_NODE_ID, type FlowGraph } from "@/lib/chatbot/types";
import { fetchWithSsrfProtection } from "@/lib/chatbot/safeFetch";
import type { MessageAttachment } from "@/lib/integrations/types";
import { generateAiEmployeeReply, type ChatHistoryMessage } from "@/lib/ai/generateReply";

/** ثقة أقل من هذا الحد (من 100) تُعامَل كتحويل فوري لموظف بشري بصرف النظر عمّا قرّره النموذج نفسه
 * بشأن needsHuman — تحقُّق مستقل في الكود، وليس ثقة عمياء بتقييم النموذج لنفسه (بند 4 في القواعد
 * غير القابلة للتفاوض). */
const LOW_CONFIDENCE_HANDOFF_THRESHOLD = 40;

/** حد أقصى لعدد القفزات بين العقد لكل تشغيلة واحدة — يمنع حلقة لا نهائية من تدفق مبني بشكل خاطئ. */
const MAX_NODE_HOPS = 25;

async function endSession(tx: Prisma.TransactionClient, conversationId: string): Promise<void> {
  await tx.conversation.update({
    where: { id: conversationId },
    data: { controlMode: "HUMAN", activeFlowId: null, currentNodeId: null, flowNodeEnteredAt: null },
  });
}

/**
 * المحرك الحقيقي الذي ينفّذ تدفق شات بوت منشور فعلياً ضد محادثة حقيقية — يُستدعى بعد استقبال أي
 * رسالة واردة (حقيقية عبر Meta أو مُحاكاة عبر sandboxSimulator، من نقطة واحدة بعد
 * applyParsedMetaWebhook). لا شيء هنا سوى محادثات controlMode="BOT" فعلياً — أي محادثة أخرى تُتجاهَل فوراً.
 */
export async function runChatbotEngine(tenantId: string, conversationId: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const convo = await tx.conversation.findUnique({ where: { id: conversationId, tenantId }, include: { contact: true } });
    if (!convo || convo.controlMode !== "BOT") return;

    let flow: { id: string; status: string; nodesJson: unknown } | null;
    let currentId: string;

    if (convo.activeFlowId && convo.currentNodeId) {
      flow = await tx.chatbotFlow.findUnique({ where: { id: convo.activeFlowId, tenantId } });
      if (!flow || flow.status !== "PUBLISHED") {
        await endSession(tx, conversationId); // التدفق أُلغي نشره أو حُذف أثناء انتظار المحادثة
        return;
      }
      currentId = convo.currentNodeId; // العقدة (سؤال) التي كانت المحادثة تنتظر رداً عندها
    } else {
      flow = await tx.chatbotFlow.findFirst({ where: { tenantId, status: "PUBLISHED" }, orderBy: { createdAt: "asc" } });
      if (!flow) return; // لا تدفق منشور فعلياً رغم controlMode=BOT (حالة نادرة) — لا شيء يُنفَّذ
      currentId = START_NODE_ID;
    }

    const graph = flow.nodesJson as unknown as FlowGraph;
    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

    const lastInbound = await tx.message.findFirst({
      where: { tenantId, conversationId, direction: "INBOUND" },
      orderBy: { createdAt: "desc" },
    });
    const lastUserText = lastInbound?.body ?? "";

    let nextId: string | undefined = findOutgoingEdge(graph, currentId)?.target;
    const adapter = await resolveWhatsappAdapter(tenantId);
    let hops = 0;
    let statusUpdated = false;

    while (nextId && hops < MAX_NODE_HOPS) {
      hops++;
      const node = nodesById.get(nextId);
      if (!node) break;

      if (node.type === "message" || node.type === "question") {
        const window = computeWindowState(convo.sessionWindowExpiresAt);
        if (!window.isOpen) {
          await endSession(tx, conversationId); // انتهت نافذة الـ24 ساعة — لا يمكن إرسال رسالة حرة، تسليم لموظف
          return;
        }

        const parsedAttachment = parseMessageAttachment(node.config);
        const attachment: MessageAttachment | undefined = parsedAttachment.linkUrl
          ? { kind: "link", url: parsedAttachment.linkUrl, text: parsedAttachment.linkText || parsedAttachment.linkUrl }
          : parsedAttachment.mediaUrl
            ? { kind: "media", mediaType: parsedAttachment.mediaType!, url: parsedAttachment.mediaUrl, filename: parsedAttachment.mediaFilename }
            : undefined;
        const result = await adapter.sendMessage(tenantId, convo.contact.phoneE164, node.label || "", attachment);
        await tx.message.create({
          data: {
            tenantId, conversationId, direction: "OUTBOUND", senderType: "BOT",
            body: node.label || "", waMessageId: result.externalMessageId,
            status: result.success ? "SENT" : "FAILED",
            statusUpdatedAt: new Date(), failureReason: result.success ? null : result.error,
          },
        });
        if (!statusUpdated) {
          await tx.conversation.update({ where: { id: conversationId }, data: { status: statusAfterOutboundReply(convo.status) } });
          statusUpdated = true;
        }

        if (!result.success) {
          // فشل إرسال حقيقي (لا اتصال واتساب فعّال، خطأ من Meta، إلخ) — تسليم صادق لموظف بدل الاستمرار
          // كأن شيئاً لم يحدث؛ الرسالة الفاشلة تبقى مسجَّلة في صندوق المحادثات لعلم الموظف بالسبب.
          await endSession(tx, conversationId);
          return;
        }

        if (node.type === "question") {
          await tx.conversation.update({
            where: { id: conversationId },
            data: { activeFlowId: flow.id, currentNodeId: node.id, flowNodeEnteredAt: new Date() },
          });
          return; // إيقاف — بانتظار رد العميل التالي
        }
        nextId = findOutgoingEdge(graph, node.id)?.target;
      } else if (node.type === "condition") {
        const matched = matchesConditionKeywords(node.label, lastUserText);
        nextId = findOutgoingEdge(graph, node.id, matched ? "true" : "false")?.target;
      } else if (node.type === "menu") {
        const branches = parseMenuBranches(node.config);
        const matchedId = matchMenuBranch(branches, lastUserText);
        nextId = findOutgoingEdge(graph, node.id, matchedId)?.target;
      } else if (node.type === "api_call") {
        // فشل الاتصال/المهلة لا يوقف التدفق — يُسجَّل ضمنياً عبر قيمة success ويُكمَل للعقدة التالية
        await fetchWithSsrfProtection(node.config || "", { phoneE164: convo.contact.phoneE164, message: lastUserText });
        nextId = findOutgoingEdge(graph, node.id)?.target;
      } else if (node.type === "ai_reply") {
        const window = computeWindowState(convo.sessionWindowExpiresAt);
        if (!window.isOpen) {
          await endSession(tx, conversationId); // انتهت نافذة الـ24 ساعة — لا يمكن إرسال رسالة حرة
          return;
        }

        const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
        // آخر 15 رسالة حقيقية (الأقدم أولاً) لبناء سياق محادثة متماسك عبر عدة رسائل — وليس رداً
        // منعزلاً لكل رسالة بمفردها (بند ب في البرومنت).
        const recentMessages = await tx.message.findMany({
          where: { tenantId, conversationId, senderType: { in: ["CONTACT", "BOT", "AGENT"] } },
          orderBy: { createdAt: "desc" }, take: 15,
        });
        const history: ChatHistoryMessage[] = recentMessages
          .slice()
          .reverse()
          .map((m) => ({ role: (m.direction === "INBOUND" ? "user" : "assistant") as "user" | "assistant", content: m.body ?? "" }))
          .filter((m) => m.content.trim().length > 0);

        const aiResult = await generateAiEmployeeReply({
          tx, tenantId, conversationId, contactId: convo.contactId,
          tenantName: tenant?.name ?? "المتجر", history, lastUserText,
        });

        // ثقة منخفضة (بصرف النظر عن قرار النموذج نفسه) = تحويل فوري — تحقُّق مستقل في الكود.
        const effectiveResult =
          aiResult.kind === "reply" && aiResult.confidence < LOW_CONFIDENCE_HANDOFF_THRESHOLD
            ? { kind: "handoff" as const, reason: `ثقة منخفضة في فهم الاستفسار (${aiResult.confidence}%)`, model: aiResult.model, usage: aiResult.usage, draftedReply: aiResult.text }
            : aiResult;

        const usage = effectiveResult.kind === "handoff" ? effectiveResult.usage : effectiveResult.usage;
        if (usage?.totalTokens) {
          await tx.subscription.updateMany({ where: { tenantId }, data: { aiTokensUsedThisPeriod: { increment: usage.totalTokens } } });
        }

        if (effectiveResult.kind === "handoff") {
          // رسالة انتقالية طبيعية للعميل قبل التسليم لموظف بشري (بند ج في البرومنت).
          const transitionText = "لحظات من فضلك 🙏 سأحوّلك الآن لأحد أفراد فريقنا لمساعدتك بشكل أفضل.";
          const transitionResult = await adapter.sendMessage(tenantId, convo.contact.phoneE164, transitionText);
          await tx.message.create({
            data: {
              tenantId, conversationId, direction: "OUTBOUND", senderType: "BOT",
              body: transitionText, waMessageId: transitionResult.externalMessageId,
              status: transitionResult.success ? "SENT" : "FAILED",
              statusUpdatedAt: new Date(), failureReason: transitionResult.success ? null : transitionResult.error,
            },
          });

          await tx.aiReplyLog.create({
            data: {
              tenantId, conversationId, userMessage: lastUserText,
              aiReply: "draftedReply" in effectiveResult ? effectiveResult.draftedReply : null,
              confidenceScore: "draftedReply" in effectiveResult ? LOW_CONFIDENCE_HANDOFF_THRESHOLD - 1 : 0,
              handoffTriggered: true, handoffReason: effectiveResult.reason,
              promptTokens: usage?.promptTokens ?? 0, completionTokens: usage?.completionTokens ?? 0, totalTokens: usage?.totalTokens ?? 0,
              model: effectiveResult.model ?? "n/a",
            },
          });

          // ملخص تلقائي كملاحظة داخلية — يوفّر وقت أول موظف بشري يفتح المحادثة (بند ج في البرومنت).
          await tx.internalNote.create({
            data: {
              tenantId, conversationId, authorId: null,
              body: `🤖 ملخص تلقائي من الموظف الذكي: تم التحويل لموظف بشري.\nالسبب: ${effectiveResult.reason}\nآخر رسالة من العميل: "${lastUserText}"`,
            },
          });

          await endSession(tx, conversationId);
          return;
        }

        // رد فعلي من الموظف الذكي — مؤشر كتابة + تأخير طبيعي متناسب مع طول الرد قبل الإرسال.
        await adapter.sendTypingIndicator?.(tenantId, convo.contact.phoneE164, lastInbound?.waMessageId ?? undefined).catch(() => {});
        const typingDelayMs = Math.min(4000, 600 + effectiveResult.text.length * 20);
        await new Promise((resolve) => setTimeout(resolve, typingDelayMs));

        const aiSendResult = await adapter.sendMessage(tenantId, convo.contact.phoneE164, effectiveResult.text);
        await tx.message.create({
          data: {
            tenantId, conversationId, direction: "OUTBOUND", senderType: "BOT",
            body: effectiveResult.text, waMessageId: aiSendResult.externalMessageId,
            status: aiSendResult.success ? "SENT" : "FAILED",
            statusUpdatedAt: new Date(), failureReason: aiSendResult.success ? null : aiSendResult.error,
          },
        });
        if (!statusUpdated) {
          await tx.conversation.update({ where: { id: conversationId }, data: { status: statusAfterOutboundReply(convo.status) } });
          statusUpdated = true;
        }

        await tx.aiReplyLog.create({
          data: {
            tenantId, conversationId, userMessage: lastUserText, aiReply: effectiveResult.text,
            confidenceScore: effectiveResult.confidence, handoffTriggered: false, usedTool: effectiveResult.usedTool,
            promptTokens: effectiveResult.usage.promptTokens, completionTokens: effectiveResult.usage.completionTokens,
            totalTokens: effectiveResult.usage.totalTokens, model: effectiveResult.model,
          },
        });

        if (!aiSendResult.success) {
          await endSession(tx, conversationId); // فشل إرسال حقيقي — تسليم صادق لموظف بدل الاستمرار
          return;
        }

        // يبقى على نفس العقدة بانتظار رسالة العميل التالية — محادثة مفتوحة مستمرة، وليست عدد قفزات
        // ثابتاً كبقية أنواع العقد (بند ب في البرومنت: "يحافظ على السياق عبر عدة رسائل").
        await tx.conversation.update({
          where: { id: conversationId },
          data: { activeFlowId: flow.id, currentNodeId: node.id, flowNodeEnteredAt: new Date() },
        });
        return;
      } else if (node.type === "handoff" || node.type === "end") {
        await endSession(tx, conversationId);
        return;
      } else {
        nextId = findOutgoingEdge(graph, node.id)?.target;
      }
    }

    // نفدت المسارات (طريق مسدود) بلا عقدة "نهاية"/"تحويل" صريحة — تسليم آمن لموظف بدل بقاء عالق صامتاً
    await endSession(tx, conversationId);
  });
}
