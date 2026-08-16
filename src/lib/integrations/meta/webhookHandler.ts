import type { MessageType } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { newSessionWindowExpiry } from "@/lib/inbox/windowState";
import { initialStatusForNewConversation, statusAfterInboundMessage } from "@/lib/inbox/conversationStatus";
import { applyTemplateDecisionTx } from "@/lib/integrations/meta/templates";

export type ParsedInboundMessage = {
  waMessageId: string;
  fromPhoneE164: string;
  fromName?: string;
  timestamp: Date;
  type: MessageType;
  body: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  latitude?: number;
  longitude?: number;
  quotedWaMessageId?: string;
};

export type ParsedStatusUpdate = {
  waMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  failureReason?: string;
};

export type ParsedTemplateStatusUpdate = {
  externalTemplateId: string;
  event: "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";
  reason?: string;
};

export type ParsedMetaWebhook = {
  phoneNumberId: string | null;
  messages: ParsedInboundMessage[];
  statuses: ParsedStatusUpdate[];
  templateStatusUpdates: ParsedTemplateStatusUpdate[];
};

function normalizePhone(waId: string): string {
  return waId.startsWith("+") ? waId : `+${waId}`;
}

function mapMessageType(metaType: string): MessageType {
  switch (metaType) {
    case "image": return "IMAGE";
    case "document": return "DOCUMENT";
    case "audio": return "AUDIO";
    case "location": return "LOCATION";
    case "interactive":
    case "button": return "INTERACTIVE_REPLY";
    default: return "TEXT";
  }
}

/**
 * يحلّل شكل حمولة Meta Cloud API الفعلي (موثّق علنياً من Meta) لاستخراج الرسائل الواردة وتحديثات
 * حالة الرسائل الصادرة. **نفس هذه الدالة** تُستخدم لمعالجة webhook حقيقي وارد من Meta وأيضاً
 * لمعالجة الأحداث التي يبنيها محاكي Sandbox (`lib/inbox/sandboxSimulator.ts`) — مسار كود واحد
 * فعلي، وليس محاكاة موازية منفصلة قد تنحرف عن السلوك الحقيقي (بند 4 في البرومنت).
 *
 * ملاحظة سياق الوسائط: Meta الفعلي يرسل `id` وسيط فقط (يتطلب استدعاء Media API لجلب رابط مؤقت) —
 * غير مُنفَّذ هنا لعدم توفر حساب Meta حقيقي للاختبار (موثّق كفجوة في QA_REPORT.md). في Sandbox،
 * يُدرَج `sandbox_media_url` مباشرة في الحمولة نفسها ليمر عبر نفس الحقل `mediaUrl` بلا فرع كود إضافي.
 */
export function parseMetaWebhookPayload(payload: unknown): ParsedMetaWebhook {
  const messages: ParsedInboundMessage[] = [];
  const statuses: ParsedStatusUpdate[] = [];
  const templateStatusUpdates: ParsedTemplateStatusUpdate[] = [];
  let phoneNumberId: string | null = null;

  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as Record<string, unknown>[]) {
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];
    for (const change of changes) {
      const value = change.value as Record<string, unknown>;
      if (!value) continue;

      // حدث تحديث حالة قالب — شكل مختلف تماماً عن حدث الرسائل/الحالات (field منفصل من Meta)
      if (change.field === "message_template_status_update") {
        const event = String(value.event);
        if (["APPROVED", "REJECTED", "PAUSED", "DISABLED"].includes(event)) {
          templateStatusUpdates.push({
            externalTemplateId: String(value.message_template_id),
            event: event as ParsedTemplateStatusUpdate["event"],
            reason: value.reason ? String(value.reason) : undefined,
          });
        }
        continue;
      }

      phoneNumberId = (value.metadata as { phone_number_id?: string })?.phone_number_id ?? phoneNumberId;

      const contacts = (value.contacts as { profile?: { name?: string }; wa_id: string }[]) ?? [];
      const contactNameByWaId = new Map(contacts.map((c) => [c.wa_id, c.profile?.name]));

      const rawMessages = (value.messages as Record<string, unknown>[]) ?? [];
      for (const m of rawMessages) {
        const from = String(m.from);
        const type = mapMessageType(String(m.type));
        const timestamp = new Date(Number(m.timestamp) * 1000);
        const context = m.context as { id?: string } | undefined;
        const base = {
          waMessageId: String(m.id),
          fromPhoneE164: normalizePhone(from),
          fromName: contactNameByWaId.get(from),
          timestamp,
          quotedWaMessageId: context?.id,
        };

        if (type === "TEXT") {
          messages.push({ ...base, type, body: String((m.text as { body?: string })?.body ?? "") });
        } else if (type === "IMAGE" || type === "DOCUMENT" || type === "AUDIO") {
          const media = m[String(m.type)] as { caption?: string; mime_type?: string; filename?: string; sandbox_media_url?: string };
          messages.push({
            ...base, type,
            body: media?.caption ?? media?.filename ?? "",
            mediaUrl: media?.sandbox_media_url,
            mediaMimeType: media?.mime_type,
          });
        } else if (type === "LOCATION") {
          const loc = m.location as { latitude?: number; longitude?: number; name?: string };
          messages.push({
            ...base, type, body: loc?.name ?? "موقع مُشارَك",
            latitude: loc?.latitude, longitude: loc?.longitude,
          });
        } else {
          const interactive = m.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } } | undefined;
          messages.push({
            ...base, type,
            body: interactive?.button_reply?.title ?? interactive?.list_reply?.title ?? "رد تفاعلي",
          });
        }
      }

      const rawStatuses = (value.statuses as Record<string, unknown>[]) ?? [];
      for (const s of rawStatuses) {
        const errors = s.errors as { title?: string }[] | undefined;
        statuses.push({
          waMessageId: String(s.id),
          status: String(s.status) as ParsedStatusUpdate["status"],
          timestamp: new Date(Number(s.timestamp) * 1000),
          failureReason: errors?.[0]?.title,
        });
      }
    }
  }

  return { phoneNumberId, messages, statuses, templateStatusUpdates };
}

/**
 * يطبّق حدثاً مُحلَّلاً على قاعدة البيانات فعلياً: ينشئ/يحدّث جهة الاتصال والمحادثة والرسائل،
 * ويُشغِّل آلة حالة المحادثة (lib/inbox/conversationStatus.ts). يُستدعى من مسار الـwebhook
 * الحقيقي ومن المحاكي على حد سواء.
 *
 * تُعيد معرّفات كل المحادثات التي استقبلت رسالة واردة في هذا الاستدعاء — المُستدعي (route.ts
 * والمحاكي) يستدعي محرك الشات بوت الحقيقي (lib/chatbot/engine.ts) لكل واحدة **بعد** التزام هذه
 * المعاملة (وليس داخلها)، حتى لا يبقي استدعاء المحرك (قد يتضمن اتصالاً شبكياً فعلياً) هذه الـtransaction مفتوحة.
 */
export async function applyParsedMetaWebhook(tenantId: string, parsed: ParsedMetaWebhook): Promise<string[]> {
  const affectedConversationIds: string[] = [];

  await withTenant(tenantId, async (tx) => {
    for (const msg of parsed.messages) {
      let contact = await tx.contact.findUnique({ where: { tenantId_phoneE164: { tenantId, phoneE164: msg.fromPhoneE164 } } });
      if (!contact) {
        contact = await tx.contact.create({
          data: { tenantId, name: msg.fromName ?? msg.fromPhoneE164, phoneE164: msg.fromPhoneE164 },
        });
      }

      let conversation = await tx.conversation.findFirst({ where: { tenantId, contactId: contact.id } });
      const isNewConversation = !conversation;
      if (!conversation) {
        const hasPublishedFlow = (await tx.chatbotFlow.count({ where: { tenantId, status: "PUBLISHED" } })) > 0;
        conversation = await tx.conversation.create({
          data: {
            tenantId, contactId: contact.id, status: initialStatusForNewConversation(),
            controlMode: hasPublishedFlow ? "BOT" : "HUMAN",
            lastMessageAt: msg.timestamp, sessionWindowExpiresAt: newSessionWindowExpiry(msg.timestamp),
          },
        });
      }

      const quotedMessage = msg.quotedWaMessageId
        ? await tx.message.findFirst({ where: { tenantId, waMessageId: msg.quotedWaMessageId } })
        : null;

      await tx.message.create({
        data: {
          tenantId, conversationId: conversation.id, direction: "INBOUND", senderType: "CONTACT",
          type: msg.type, body: msg.body, mediaUrl: msg.mediaUrl, mediaMimeType: msg.mediaMimeType,
          latitude: msg.latitude, longitude: msg.longitude, quotedMessageId: quotedMessage?.id,
          waMessageId: msg.waMessageId, createdAt: msg.timestamp,
        },
      });

      if (!isNewConversation) {
        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: msg.timestamp, sessionWindowExpiresAt: newSessionWindowExpiry(msg.timestamp),
            status: statusAfterInboundMessage(),
          },
        });
      }

      affectedConversationIds.push(conversation.id);
    }

    for (const status of parsed.statuses) {
      await applyStatusUpdate(tx, tenantId, status);
    }

    for (const templateUpdate of parsed.templateStatusUpdates) {
      const template = await tx.messageTemplate.findFirst({ where: { tenantId, externalTemplateId: templateUpdate.externalTemplateId } });
      if (!template) continue;
      await applyTemplateDecisionTx(tx, template.id, templateUpdate.event, templateUpdate.reason);
    }
  });

  return affectedConversationIds;
}

/** يُصدَّر مستقلاً ليُستخدم أيضاً من عامل محاكاة تقدُّم حالة الرسائل في وضع Sandbox (نفس منطق التحديث). */
export async function applyStatusUpdate(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  status: ParsedStatusUpdate
): Promise<void> {
  const message = await tx.message.findFirst({ where: { tenantId, waMessageId: status.waMessageId } });
  if (!message) return;
  await tx.message.update({
    where: { id: message.id },
    data: {
      status: status.status.toUpperCase() as never,
      statusUpdatedAt: status.timestamp,
      failureReason: status.status === "failed" ? status.failureReason ?? "فشل غير معروف" : null,
    },
  });
}
