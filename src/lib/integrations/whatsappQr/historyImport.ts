import type { proto } from "@whiskeysockets/baileys";
import { withTenant } from "@/lib/db";
import { newSessionWindowExpiry } from "@/lib/inbox/windowState";
import { initialStatusForNewConversation, statusAfterInboundMessage } from "@/lib/inbox/conversationStatus";
import { jidToPhoneE164 } from "@/lib/integrations/whatsappQr/sessionManager";

/** أقصى عدد رسائل تُستورَد لكل جهة اتصال — تجنُّباً لاستيراد سنوات من السجل في قناة تجريبية فقط. */
const MAX_MESSAGES_PER_CONTACT = 50;

type HistoricalEntry = { waMessageId: string; fromMe: boolean; timestamp: Date; body: string };

/**
 * استيراد المحادثات القديمة (قبل ربط القناة التجريبية) — يُستدعى من حدث Baileys
 * `messaging-history.set` الذي يصل مرة (أو دفعات) فور نجاح الاتصال لأول مرة. **متعمَّد الفصل عن
 * applyParsedMetaWebhook** (المستخدَم للرسائل الحية الجديدة في sessionManager.ts): ذاك المسار مصمَّم
 * لرسالة واحدة واردة في وقتها الفعلي (يُحدِّث حالة المحادثة وحدها في كل استدعاء) — استخدامه لاستيراد
 * عشرات الرسائل القديمة دفعة واحدة كان سيُنتج تحديثات حالة متتالية وهمية بدل قراءة الحالة النهائية
 * الصحيحة فقط. المجموعات (@g.us) والقوائم البثّية (@broadcast) مُستثناة عمداً — القناة التجريبية
 * لعملاء التاجر الفرديين وليس محادثات جماعية.
 */
export async function importHistoricalMessages(tenantId: string, messages: proto.IWebMessageInfo[]): Promise<void> {
  const byContact = new Map<string, { pushName?: string; entries: HistoricalEntry[] }>();

  for (const msg of messages) {
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || !msg.key.id || !msg.message) continue;
    if (remoteJid.endsWith("@g.us") || remoteJid.endsWith("@broadcast")) continue;

    const phoneE164 = jidToPhoneE164(remoteJid);
    const text = msg.message.conversation ?? msg.message.extendedTextMessage?.text ?? null;
    const entry: HistoricalEntry = {
      waMessageId: msg.key.id,
      fromMe: Boolean(msg.key.fromMe),
      timestamp: new Date(Number(msg.messageTimestamp ?? 0) * 1000),
      body: text ?? "[نوع رسالة غير مدعوم في القناة التجريبية]",
    };

    const bucket = byContact.get(phoneE164) ?? { pushName: msg.pushName ?? undefined, entries: [] };
    bucket.entries.push(entry);
    byContact.set(phoneE164, bucket);
  }

  if (byContact.size === 0) return;

  await withTenant(tenantId, async (tx) => {
    for (const [phoneE164, { pushName, entries }] of byContact.entries()) {
      const recent = entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()).slice(-MAX_MESSAGES_PER_CONTACT);
      if (recent.length === 0) continue;

      let contact = await tx.contact.findUnique({ where: { tenantId_phoneE164: { tenantId, phoneE164 } } });
      if (!contact) {
        contact = await tx.contact.create({ data: { tenantId, name: pushName ?? phoneE164, phoneE164 } });
      }

      const first = recent[0]!;
      let conversation = await tx.conversation.findFirst({ where: { tenantId, contactId: contact.id } });
      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            tenantId, contactId: contact.id, status: initialStatusForNewConversation(), controlMode: "HUMAN",
            lastMessageAt: first.timestamp, sessionWindowExpiresAt: newSessionWindowExpiry(first.timestamp),
          },
        });
      }

      for (const entry of recent) {
        const exists = await tx.message.findFirst({ where: { tenantId, waMessageId: entry.waMessageId } });
        if (exists) continue;
        await tx.message.create({
          data: {
            tenantId, conversationId: conversation.id,
            direction: entry.fromMe ? "OUTBOUND" : "INBOUND",
            senderType: entry.fromMe ? "SYSTEM" : "CONTACT",
            type: "TEXT", body: entry.body, waMessageId: entry.waMessageId, createdAt: entry.timestamp,
            status: entry.fromMe ? "DELIVERED" : null,
            statusUpdatedAt: entry.fromMe ? entry.timestamp : null,
          },
        });
      }

      const last = recent[recent.length - 1]!;
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: last.timestamp,
          sessionWindowExpiresAt: newSessionWindowExpiry(last.timestamp),
          status: last.fromMe ? conversation.status : statusAfterInboundMessage(),
        },
      });
    }
  });
}
