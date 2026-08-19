import { IntegrationProvider } from "@prisma/client";
import type { IntegrationAdapter, SendMessageResult, SyncResult, MessageAttachment } from "@/lib/integrations/types";
import { withTenant } from "@/lib/db";
import { getSocket, phoneE164ToJid } from "@/lib/integrations/whatsappQr/sessionManager";
import { whatsappQrStopQueue } from "@/lib/integrations/whatsappQr/queue";
import { fetchMediaWithSsrfProtection } from "@/lib/chatbot/safeFetch";

/**
 * محوّل القناة التجريبية (Baileys/QR). خلافاً لـMeta/Zid/Salla، لا يوجد هنا OAuth ولا HTTP webhook
 * حقيقي — التفعيل يتم حصراً عبر startWhatsappQrTrialAction (مسح QR)، انظر DECISIONS.md للتفاصيل.
 */
export const whatsappQrAdapter: IntegrationAdapter = {
  provider: IntegrationProvider.WHATSAPP_QR,

  getAuthorizationUrl(): string {
    throw new Error("هذه القناة تُفعَّل عبر مسح رمز QR فقط، انظر startWhatsappQrTrialAction");
  },

  async handleAuthorizationCallback(): Promise<{ externalAccountId: string }> {
    throw new Error("هذه القناة تُفعَّل عبر مسح رمز QR فقط، انظر startWhatsappQrTrialAction");
  },

  async syncOrders(): Promise<SyncResult> {
    return { ordersSynced: 0, productsSynced: 0 }; // لا علاقة لواتساب بمزامنة طلبات، كما في Meta
  },

  async sendMessage(tenantId: string, phoneE164: string, body: string, attachment?: MessageAttachment): Promise<SendMessageResult> {
    const sock = getSocket(tenantId);
    if (!sock) {
      return { success: false, error: "جلسة واتساب التجريبية غير متصلة حالياً" };
    }
    const jid = phoneE164ToJid(phoneE164);

    try {
      if (attachment?.kind === "link") {
        // لا يوجد دعم موثوق لأزرار CTA URL الحقيقية عبر Baileys (قناة غير رسمية، واتساب المتعدد
        // الأجهزة يرفض/يتجاهل أغلب رسائل الأزرار غير الرسمية) — الرابط يُلحَق كنص واضح بدل زر حقيقي.
        const fullBody = `${body}\n\n🔗 ${attachment.text}: ${attachment.url}`;
        const result = await sock.sendMessage(jid, { text: fullBody });
        return { success: true, externalMessageId: result?.key.id ?? undefined };
      }

      if (attachment?.kind === "media") {
        // خلافاً لقناة Meta الرسمية (خوادم Meta تُحمِّل رابط الوسائط)، Baileys يُحمِّل الوسائط من
        // خلال خادمنا نفسه (عملية العامل) لإعادة رفعها لواتساب — رابط أدخله التاجر يجعل خادمنا يتصل
        // بعنوان خارجي. تمرير الرابط لـBaileys ليُحمِّله بنفسه كان يتجاوز أي تحصين SSRF تماماً (لا
        // تحقّق على IP الذي تتصل به المكتبة داخلياً)، فنُحمِّل الوسائط بأنفسنا عبر الاتصال المُحصَّن
        // (رفض IP خاص/محجوز + تثبيت عنوان IP يمنع DNS rebinding) ثم نمرر البيانات الخام لـBaileys.
        const download = await fetchMediaWithSsrfProtection(attachment.url);
        if (!download.success) return { success: false, error: download.error };

        const mediaMessage =
          attachment.mediaType === "image"
            ? { image: download.buffer, caption: body || undefined }
            : attachment.mediaType === "video"
              ? { video: download.buffer, caption: body || undefined }
              : {
                  document: download.buffer,
                  fileName: attachment.filename || "ملف",
                  mimetype: guessMimeType(attachment.filename || attachment.url),
                  caption: body || undefined,
                };

        const result = await sock.sendMessage(jid, mediaMessage);
        return { success: true, externalMessageId: result?.key.id ?? undefined };
      }

      const result = await sock.sendMessage(jid, { text: body });
      return { success: true, externalMessageId: result?.key.id ?? undefined };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "فشل الإرسال عبر القناة التجريبية" };
    }
  },

  /** Baileys يدعم مؤشر "يكتب الآن..." فعلياً عبر sendPresenceUpdate("composing", jid) — best-effort،
   * يُبتلَع أي خطأ لأنه لا يجب أن يوقف إرسال الرد الفعلي. */
  async sendTypingIndicator(tenantId: string, phoneE164: string): Promise<void> {
    const sock = getSocket(tenantId);
    if (!sock) return;
    await sock.sendPresenceUpdate("composing", phoneE164ToJid(phoneE164)).catch(() => {});
  },

  async verifyWebhookSignature(): Promise<boolean> {
    // لا يوجد HTTP webhook فعلي لهذه القناة — الأحداث تصل عبر socket حي داخل عملية العامل نفسها،
    // وليس طلب HTTP خارجي يحتاج تحقق توقيع. لا تُستدعى هذه الدالة فعلياً لهذا المزوّد.
    return true;
  },

  async disconnect(tenantId: string): Promise<void> {
    // يُحدَّث الصف فوراً هنا (نفس عملية Next.js) كي تعكس الواجهة الحالة الصحيحة بلا تأخير، ثم يُرسَل
    // أمر فعلي لعملية العامل (Baileys socket الحي يعيش هناك فقط) لتسجيل الخروج الحقيقي ومسح بيانات
    // الجلسة على القرص — بدون هذا الفصل، revalidatePath بعد disconnect() كانت ستعرض حالة قديمة
    // (CONNECTED) لبضع ثوانٍ ريثما تعالج عملية العامل المهمة.
    await withTenant(tenantId, (tx) =>
      tx.integration.updateMany({
        where: { tenantId, provider: IntegrationProvider.WHATSAPP_QR },
        data: { status: "DISCONNECTED", encryptedSessionData: null, qrTrialExpiresAt: null },
      })
    );
    await whatsappQrStopQueue.add("stop", { tenantId });
  },
};

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};

/** Baileys يتطلّب mimetype صريحاً لرسائل المستندات (خلافاً للصور/الفيديو) — يُستنتَج من امتداد
 * اسم الملف أو الرابط، مع نوع عام افتراضي إن تعذّر التحديد بدل رفض الإرسال بالكامل. */
function guessMimeType(nameOrUrl: string): string {
  const ext = nameOrUrl.split(".").pop()?.toLowerCase().split("?")[0];
  return (ext && MIME_TYPES_BY_EXTENSION[ext]) || "application/octet-stream";
}
