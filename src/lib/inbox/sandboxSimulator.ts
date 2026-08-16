import { applyParsedMetaWebhook, type ParsedMetaWebhook } from "@/lib/integrations/meta/webhookHandler";
import { runChatbotEngine } from "@/lib/chatbot/engine";
import {
  SANDBOX_INBOUND_TEXTS, SANDBOX_INBOUND_LOCATION, SANDBOX_INBOUND_DOCUMENT, SANDBOX_INBOUND_IMAGE_CAPTION,
  SANDBOX_INBOUND_IMAGE_DATA_URI,
} from "@/lib/integrations/fixtures";

export type SimulatedMessageKind = "text" | "image" | "document" | "location";

/**
 * يبني حدثاً "مُحلَّلاً" واقعياً (نفس شكل مخرجات parseMetaWebhookPayload تماماً) لمحاكاة رسالة
 * واردة من عميل في وضع Sandbox — ثم يُمرَّر لنفس applyParsedMetaWebhook التي يستخدمها webhook
 * Meta الحقيقي، فلا يوجد أي منطق معالجة مكرر بين المسارين (بند 4 في البرومنت).
 */
export async function simulateInboundMessage(
  tenantId: string,
  fromPhoneE164: string,
  fromName: string,
  kind: SimulatedMessageKind = "text",
  customBody?: string
): Promise<void> {
  const waMessageId = `wamid.sandbox.in.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date();

  const parsed: ParsedMetaWebhook = { phoneNumberId: null, messages: [], statuses: [], templateStatusUpdates: [] };

  if (kind === "text") {
    parsed.messages.push({
      waMessageId, fromPhoneE164, fromName, timestamp, type: "TEXT",
      body: customBody ?? SANDBOX_INBOUND_TEXTS[Math.floor(Math.random() * SANDBOX_INBOUND_TEXTS.length)]!,
    });
  } else if (kind === "image") {
    parsed.messages.push({
      waMessageId, fromPhoneE164, fromName, timestamp, type: "IMAGE",
      body: SANDBOX_INBOUND_IMAGE_CAPTION,
      mediaUrl: SANDBOX_INBOUND_IMAGE_DATA_URI,
      mediaMimeType: "image/svg+xml",
    });
  } else if (kind === "document") {
    parsed.messages.push({
      waMessageId, fromPhoneE164, fromName, timestamp, type: "DOCUMENT",
      body: SANDBOX_INBOUND_DOCUMENT.filename,
      mediaUrl: "https://example.com/sandbox-files/invoice-return.pdf",
      mediaMimeType: SANDBOX_INBOUND_DOCUMENT.mimeType,
    });
  } else if (kind === "location") {
    parsed.messages.push({
      waMessageId, fromPhoneE164, fromName, timestamp, type: "LOCATION",
      body: SANDBOX_INBOUND_LOCATION.name,
      latitude: SANDBOX_INBOUND_LOCATION.latitude, longitude: SANDBOX_INBOUND_LOCATION.longitude,
    });
  }

  const affectedConversationIds = await applyParsedMetaWebhook(tenantId, parsed);
  for (const conversationId of affectedConversationIds) {
    await runChatbotEngine(tenantId, conversationId).catch((err) =>
      console.error(`❌ فشل تشغيل محرك الشات بوت (محاكاة) للمحادثة ${conversationId}:`, err instanceof Error ? err.message : err)
    );
  }
}
