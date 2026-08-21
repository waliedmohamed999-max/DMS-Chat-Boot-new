import makeWASocket, { DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, type WASocket } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { IntegrationProvider } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { useTenantAuthState } from "@/lib/integrations/whatsappQr/authState";
import { setQrStatus, clearQrStatus } from "@/lib/integrations/whatsappQr/redisStatus";
import { applyParsedMetaWebhook, type ParsedInboundMessage } from "@/lib/integrations/meta/webhookHandler";
import { importHistoricalMessages } from "@/lib/integrations/whatsappQr/historyImport";
import { runChatbotEngine } from "@/lib/chatbot/engine";
import { transcribeVoiceMessage } from "@/lib/ai/transcribeVoiceMessage";
import { getTenantChatbotLimits } from "@/lib/planLimits";

/** مدة صلاحية موحّدة لكل الباقات (قرار المستخدم: تفعيل عام + مدة ثابتة بدل إعداد لكل باقة). */
const QR_TRIAL_DURATION_MS = 3 * 24 * 3600 * 1000;

const logger = pino({ level: "silent" });

/** Sockets حية في ذاكرة عملية العامل — يفترض التصميم نسخة واحدة فقط من `npm run worker` (راجع DECISIONS.md). */
const activeSockets = new Map<string, WASocket>();
const startingTenants = new Set<string>();

export function jidToPhoneE164(jid: string): string {
  const user = (jid.split("@")[0] ?? "").split(":")[0] ?? "";
  return `+${user}`;
}

function phoneE164ToJid(phoneE164: string): string {
  return `${phoneE164.replace(/^\+/, "")}@s.whatsapp.net`;
}

async function markConnected(tenantId: string, connectedPhoneE164: string, pushName?: string): Promise<void> {
  const qrTrialExpiresAt = new Date(Date.now() + QR_TRIAL_DURATION_MS);
  await withTenant(tenantId, (tx) =>
    tx.integration.upsert({
      where: { tenantId_provider: { tenantId, provider: IntegrationProvider.WHATSAPP_QR } },
      update: { status: "CONNECTED", lastError: null, qrTrialExpiresAt, metadataJson: { connectedPhoneE164, pushName } },
      create: {
        tenantId, provider: IntegrationProvider.WHATSAPP_QR, status: "CONNECTED", isSandbox: false,
        qrTrialExpiresAt, metadataJson: { connectedPhoneE164, pushName },
      },
    })
  );
  await setQrStatus(tenantId, { state: "connected", connectedPhoneE164 });
}

async function markDisconnected(tenantId: string, lastError?: string): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx.integration.updateMany({
      where: { tenantId, provider: IntegrationProvider.WHATSAPP_QR },
      data: { status: "DISCONNECTED", lastError: lastError ?? null },
    })
  );
  await setQrStatus(tenantId, { state: "disconnected", error: lastError });
}

async function handleIncomingMessages(tenantId: string, messages: import("@whiskeysockets/baileys").proto.IWebMessageInfo[]): Promise<void> {
  const parsed: ParsedInboundMessage[] = [];
  // تُجلَب مرة واحدة فقط عند أول رسالة صوتية فعلية (بدل كل دورة) — لا حاجة لاستعلام قاعدة بيانات
  // إضافي على كل دفعة رسائل واردة لا تحوي أي رسالة صوتية أصلاً.
  let voiceMessagesEnabled: boolean | null = null;

  for (const msg of messages) {
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || msg.key.fromMe || remoteJid.endsWith("@g.us") || !msg.message) continue;

    const base = {
      waMessageId: msg.key.id ?? `wa-qr-${Date.now()}`,
      fromPhoneE164: jidToPhoneE164(remoteJid),
      fromName: msg.pushName ?? undefined,
      timestamp: new Date(Number(msg.messageTimestamp ?? Date.now() / 1000) * 1000),
    };

    const text = msg.message.conversation ?? msg.message.extendedTextMessage?.text ?? null;
    if (text !== null) {
      parsed.push({ ...base, type: "TEXT", body: text });
      continue;
    }

    const audioMessage = msg.message.audioMessage;
    if (audioMessage) {
      if (voiceMessagesEnabled === null) {
        voiceMessagesEnabled = (await getTenantChatbotLimits(tenantId)).voiceMessagesEnabled;
      }
      let transcript: string | null = null;
      if (voiceMessagesEnabled) {
        try {
          const buffer = (await downloadMediaMessage(msg, "buffer", {})) as Buffer;
          transcript = await transcribeVoiceMessage(buffer, audioMessage.mimetype ?? "audio/ogg");
        } catch (err) {
          console.error(`❌ فشل تنزيل رسالة صوتية عبر قناة QR التجريبية للمستأجر ${tenantId}:`, err);
        }
      }
      parsed.push({ ...base, type: "AUDIO", body: transcript ?? "[رسالة صوتية]", mediaMimeType: audioMessage.mimetype ?? undefined });
      continue;
    }

    parsed.push({ ...base, type: "TEXT", body: "[نوع رسالة غير مدعوم في القناة التجريبية]" });
  }
  if (parsed.length === 0) return;
  const affectedConversationIds = await applyParsedMetaWebhook(tenantId, { phoneNumberId: null, messages: parsed, statuses: [], templateStatusUpdates: [] });
  for (const conversationId of affectedConversationIds) {
    await runChatbotEngine(tenantId, conversationId).catch((err) =>
      console.error(`❌ فشل تشغيل محرك الشات بوت (قناة QR) للمحادثة ${conversationId}:`, err instanceof Error ? err.message : err)
    );
  }
}

/** يبدأ (أو يستأنف) جلسة Baileys لمستأجر — عملية idempotent، لا تُنشئ socket مكرَّراً إن كانت قائمة أصلاً. */
export async function startSession(tenantId: string): Promise<void> {
  if (activeSockets.has(tenantId) || startingTenants.has(tenantId)) return;
  startingTenants.add(tenantId);

  try {
    const { state, saveState } = await useTenantAuthState(tenantId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false });
    activeSockets.set(tenantId, sock);

    sock.ev.on("creds.update", saveState);

    sock.ev.on("connection.update", async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        await setQrStatus(tenantId, { state: "waiting_scan", qr });
      }

      if (connection === "open") {
        const me = sock.user;
        const connectedPhoneE164 = me ? jidToPhoneE164(me.id) : "غير معروف";
        await markConnected(tenantId, connectedPhoneE164, me?.name);
      }

      if (connection === "close") {
        activeSockets.delete(tenantId);
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        if (loggedOut) {
          await markDisconnected(tenantId, "تم تسجيل الخروج من الهاتف مباشرة");
        } else {
          // انقطاع غير متوقَّع (شبكة، إعادة تشغيل عملية العامل) — محاولة استئناف تلقائية واحدة بنفس بيانات الجلسة المحفوظة
          await setQrStatus(tenantId, { state: "disconnected", error: "انقطع الاتصال، جارٍ محاولة الاستئناف..." });
          startingTenants.delete(tenantId);
          await startSession(tenantId);
          return;
        }
      }
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;
      handleIncomingMessages(tenantId, messages).catch((err) =>
        console.error(`❌ فشل معالجة رسالة واردة عبر قناة QR التجريبية للمستأجر ${tenantId}:`, err)
      );
    });

    // يصل مرة (أو دفعات) فور نجاح الاتصال لأول مرة — يحمل المحادثات/الرسائل القديمة قبل الربط.
    sock.ev.on("messaging-history.set", ({ messages }) => {
      importHistoricalMessages(tenantId, messages).catch((err) =>
        console.error(`❌ فشل استيراد المحادثات القديمة عبر قناة QR التجريبية للمستأجر ${tenantId}:`, err)
      );
    });
  } finally {
    startingTenants.delete(tenantId);
  }
}

/** يقطع الجلسة نهائياً ويمسح كل بيانات الاعتماد — يُستدعى يدوياً (فصل من الواجهة) أو آلياً (انتهاء مدة التجربة). */
export async function stopSession(tenantId: string, reason?: string): Promise<void> {
  const sock = activeSockets.get(tenantId);
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // تجاهل فشل تسجيل الخروج (قد يكون الاتصال مقطوعاً أصلاً) — المهم مسح البيانات محلياً بعده
    }
    activeSockets.delete(tenantId);
  }

  await withTenant(tenantId, (tx) =>
    tx.integration.updateMany({
      where: { tenantId, provider: IntegrationProvider.WHATSAPP_QR },
      data: { status: "DISCONNECTED", encryptedSessionData: null, qrTrialExpiresAt: null, lastError: reason ?? null },
    })
  );
  await clearQrStatus(tenantId);
}

export function getSocket(tenantId: string): WASocket | undefined {
  return activeSockets.get(tenantId);
}

export { phoneE164ToJid };
