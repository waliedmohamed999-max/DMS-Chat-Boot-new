import { Worker, Queue, type Job } from "bullmq";
import { redisConnection } from "@/lib/queue/connection";
import { withTenant, superAdminDb } from "@/lib/db";
import { resolveWhatsappAdapter } from "@/lib/integrations/registry";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { resolveAudienceWhere, type SegmentFilter } from "@/lib/campaigns/audience";
import { simulateEngagementFunnel } from "@/lib/campaigns/simulateOutcome";
import { scanAllTenantsTriggeredCampaigns } from "@/lib/campaigns/triggerEngine";
import type { CampaignSendJob } from "@/lib/queue/campaignQueue";
import { applyStatusUpdate } from "@/lib/integrations/meta/webhookHandler";
import type { MessageStatusSimJob } from "@/lib/queue/messageStatusQueue";
import { applyTemplateDecision, simulateTemplateDecision } from "@/lib/integrations/meta/templates";
import type { TemplateStatusSimJob } from "@/lib/queue/templateStatusQueue";
import { startSession as startWhatsappQrSession, stopSession as stopWhatsappQrSession } from "@/lib/integrations/whatsappQr/sessionManager";
import type { WhatsappQrJobData } from "@/lib/integrations/whatsappQr/queue";
import { scanAndExpireQrTrials } from "@/lib/integrations/whatsappQr/expireTrial";
import { scanAndResetStuckChatbotSessions } from "@/lib/chatbot/timeoutScan";
import { scanAndExpireSubscriptions } from "@/lib/billing/expireSubscriptions";
import { recognizeRevenueForActiveInvoices } from "@/lib/accounting/revenueRecognition";
import { syncAffiliateCommissions } from "@/lib/affiliates/commissionSync";
import type { Prisma } from "@prisma/client";

// حد إرسال لكل مستأجر: 60 رسالة كل 10 ثوانٍ، بحد أقصى منطقي لتجريب الحملات دون أن تحتكر
// حملة تاجر واحد عامل الإرسال المشترك بين كل المستأجرين.
const TENANT_SEND_LIMIT = 60;
const TENANT_SEND_WINDOW_SECONDS = 10;
// فحص دوري للحملات الآلية (كل 5 دقائق) — يعادل "cron" حقيقي عبر مهمة BullMQ متكررة، دون
// الحاجة لخدمة جدولة منفصلة. راجع lib/campaigns/triggerEngine.ts للمنطق الفعلي.
const TRIGGER_SCAN_INTERVAL_MS = 5 * 60 * 1000;

type CampaignWithRelations = Prisma.CampaignGetPayload<{ include: { segment: true; template: true } }>;

/** يرسل رسالة واحدة لجهة اتصال ضمن حملة، ويحدّث حالة المستلم + عدادات الحملة + حصة الرسائل الشهرية. */
async function sendToContact(
  tx: Prisma.TransactionClient,
  tenantId: string,
  campaign: CampaignWithRelations,
  contact: { id: string; name: string; phoneE164: string }
): Promise<"sent" | "failed"> {
  const rateLimit = await checkTenantRateLimit(tenantId, "campaign-send", TENANT_SEND_LIMIT, TENANT_SEND_WINDOW_SECONDS);
  if (!rateLimit.allowed) {
    throw new Error(`تجاوز حد الإرسال المسموح للمستأجر ${tenantId} — سيُعاد المحاولة تلقائياً`);
  }

  const personalizedBody = campaign.template.bodyText.replace("{{1}}", contact.name);
  const adapter = await resolveWhatsappAdapter(tenantId);
  const result = await adapter.sendMessage(tenantId, contact.phoneE164, personalizedBody);
  const now = new Date();

  const recipientData = result.success
    ? { ...simulateEngagementFunnel(now), errorMessage: null, sentAt: now }
    : { status: "FAILED" as const, errorMessage: result.error ?? "فشل غير معروف", sentAt: now, deliveredAt: null, readAt: null };

  await tx.campaignRecipient.upsert({
    where: { campaignId_contactId: { campaignId: campaign.id, contactId: contact.id } },
    update: recipientData,
    create: { campaignId: campaign.id, contactId: contact.id, ...recipientData },
  });

  // عدادات الحملة حصرية لكل مستلم (لا تراكم مزدوج) — الواجهة تجمع deliveredCount+readCount+repliedCount
  // لعرض "تم التسليم" التراكمي، لأن "قُرئت"/"رُدّ عليها" تعني ضمنياً أنها سُلّمت فعلاً.
  const counterField =
    recipientData.status === "FAILED" ? "failedCount"
    : recipientData.status === "REPLIED" ? "repliedCount"
    : recipientData.status === "READ" ? "readCount"
    : "deliveredCount";
  await tx.campaign.update({ where: { id: campaign.id }, data: { sentCount: { increment: 1 }, [counterField]: { increment: 1 } } });

  // كل محاولة إرسال فعلية (نجحت أو فشلت) تُحتسب من حصة الباقة الشهرية — نفس منطق فوترة واتساب
  // الفعلي (يُحاسَب عند وصول الطلب لواجهة الإرسال، وليس فقط عند نجاحه).
  await tx.subscription.updateMany({ where: { tenantId }, data: { messagesUsedThisPeriod: { increment: 1 } } });

  if (result.success) {
    let conversation = await tx.conversation.findFirst({ where: { tenantId, contactId: contact.id } });
    if (!conversation) {
      conversation = await tx.conversation.create({
        data: { tenantId, contactId: contact.id, status: "NEW", lastMessageAt: now },
      });
    }
    await tx.message.create({
      data: {
        tenantId, conversationId: conversation.id, direction: "OUTBOUND", senderType: "SYSTEM",
        body: personalizedBody, campaignId: campaign.id, waMessageId: result.externalMessageId,
      },
    });
    return "sent";
  }
  return "failed";
}

/**
 * عامل معالجة إرسال الحملات. مساران:
 * 1) `contactIds` غائب → حملة لمرة واحدة: يحل جمهور الحملة بالكامل (كل جهات الاتصال أو شريحة)
 *    ويرسل للجميع، ثم يضبط الحالة النهائية COMPLETED.
 * 2) `contactIds` محدَّد → إطلاق حملة آلية لدفعة جهات اتصال بعينها استجابةً لحدث مُشغِّل — الحملة
 *    تبقى ACTIVE (مستمرة إلى أجل غير مسمى)، ولا يُغيَّر حالتها هنا إطلاقاً.
 */
async function processCampaign(job: Job<CampaignSendJob>) {
  const { tenantId, campaignId, contactIds } = job.data;

  await withTenant(tenantId, async (tx) => {
    const campaign = await tx.campaign.findUniqueOrThrow({
      where: { id: campaignId, tenantId },
      include: { segment: true, template: true },
    });

    const subscription = await tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    let remainingQuota = subscription ? subscription.plan.maxMessagesPerMonth - subscription.messagesUsedThisPeriod : Infinity;

    if (contactIds && contactIds.length > 0) {
      // مسار الإطلاق الآلي: نرسل فقط لدفعة جهات الاتصال التي حدّدها محرك الأحداث
      const contacts = await tx.contact.findMany({ where: { tenantId, id: { in: contactIds } } });
      for (const contact of contacts) {
        if (remainingQuota <= 0) break; // توقف صامت عند نفاد الحصة — الدفعة التالية تُكمل لاحقاً
        await sendToContact(tx, tenantId, campaign, contact);
        remainingQuota--;
      }
      return;
    }

    if (campaign.status === "COMPLETED") return;
    await tx.campaign.update({ where: { id: campaignId }, data: { status: "SENDING" } });

    const filter = (campaign.segment?.filterJson as SegmentFilter | null) ?? null;
    const where = resolveAudienceWhere(tenantId, campaign.audienceType, filter);
    const contacts = await tx.contact.findMany({ where });

    let quotaExhausted = false;
    for (const contact of contacts) {
      const existing = await tx.campaignRecipient.findUnique({
        where: { campaignId_contactId: { campaignId, contactId: contact.id } },
      });
      if (existing) continue;

      if (remainingQuota <= 0) { quotaExhausted = true; break; }
      await sendToContact(tx, tenantId, campaign, contact);
      remainingQuota--;
    }

    await tx.campaign.update({
      where: { id: campaignId },
      data: { status: quotaExhausted ? "FAILED" : "COMPLETED" },
    });
  });
}

export const campaignWorker = new Worker<CampaignSendJob>(
  "campaign-send",
  async (job) => processCampaign(job),
  { connection: redisConnection, concurrency: 2 }
);

campaignWorker.on("completed", (job) => console.log(`✅ اكتملت مهمة إرسال الحملة ${job.data.campaignId}`));
campaignWorker.on("failed", (job, err) => console.error(`❌ فشلت مهمة إرسال الحملة ${job?.data.campaignId}:`, err.message));

// مهمة متكررة لفحص الحملات الآلية عبر كل المستأجرين — تعمل داخل نفس عملية العامل (`npm run worker`).
const triggerScanWorker = new Worker(
  "campaign-trigger-scan",
  async () => scanAllTenantsTriggeredCampaigns(),
  { connection: redisConnection, concurrency: 1 }
);
triggerScanWorker.on("failed", (job, err) => console.error("❌ فشل فحص الحملات الآلية:", err.message));

const triggerScanQueue = new Queue("campaign-trigger-scan", { connection: redisConnection });
async function scheduleTriggerScan() {
  await triggerScanQueue.add("scan", {}, {
    repeat: { every: TRIGGER_SCAN_INTERVAL_MS },
    jobId: "recurring-trigger-scan",
  });
}
scheduleTriggerScan().catch((err) => console.error("❌ تعذّرت جدولة فحص الحملات الآلية:", err));

// محاكاة تقدُّم حالة الرسائل الصادرة في وضع Sandbox (SENT → DELIVERED → READ) — انظر
// lib/queue/messageStatusQueue.ts. يُستخدم نفس منطق تحديث الحالة الذي يستخدمه webhook حقيقي وارد.
const messageStatusWorker = new Worker<MessageStatusSimJob>(
  "message-status-sim",
  async (job) => {
    const { tenantId, waMessageId, status, failureReason } = job.data;
    await withTenant(tenantId, (tx) => applyStatusUpdate(tx, tenantId, { waMessageId, status, timestamp: new Date(), failureReason }));
  },
  { connection: redisConnection, concurrency: 5 }
);
messageStatusWorker.on("failed", (job, err) => console.error("❌ فشل تحديث حالة رسالة محاكاة:", err.message));

// محاكاة قرار مراجعة Meta لقالب رسالة في وضع Sandbox — نفس منطق applyTemplateDecision الذي
// يستخدمه أيضاً webhook حقيقي وارد (message_template_status_update)، انظر templates.ts.
const templateStatusWorker = new Worker<TemplateStatusSimJob>(
  "template-status-sim",
  async (job) => {
    const { tenantId, templateId } = job.data;
    const decision = simulateTemplateDecision();
    await applyTemplateDecision(tenantId, templateId, decision.event, decision.reason);
  },
  { connection: redisConnection, concurrency: 5 }
);
templateStatusWorker.on("failed", (job, err) => console.error("❌ فشل تحديث حالة قالب محاكاة:", err.message));

// قناة واتساب التجريبية (QR/Baileys) — الـsocket الحي يعيش حصراً هنا داخل عملية العامل (وليس عملية
// Next.js القصيرة العمر). الأوامر "ابدأ/أوقف" تصل من Next.js عبر هذين الطابورين
// (lib/integrations/whatsappQr/queue.ts)، والحالة اللحظية (QR الحالي/متصل) تُكتب مباشرة في Redis
// لتستطلعها واجهة Next.js (لا حاجة لـWorker يعيد شيئاً هنا، فقط ينفّذ الأمر).
const whatsappQrStartWorker = new Worker<WhatsappQrJobData>(
  "whatsapp-qr-start",
  async (job) => startWhatsappQrSession(job.data.tenantId),
  { connection: redisConnection, concurrency: 5 }
);
whatsappQrStartWorker.on("failed", (job, err) => console.error(`❌ فشل بدء جلسة القناة التجريبية للمستأجر ${job?.data.tenantId}:`, err.message));

const whatsappQrStopWorker = new Worker<WhatsappQrJobData>(
  "whatsapp-qr-stop",
  async (job) => stopWhatsappQrSession(job.data.tenantId),
  { connection: redisConnection, concurrency: 5 }
);
whatsappQrStopWorker.on("failed", (job, err) => console.error(`❌ فشل إيقاف جلسة القناة التجريبية للمستأجر ${job?.data.tenantId}:`, err.message));

// فحص دوري (كل 30 دقيقة) لقطع جلسات QR التجريبية المنتهية صلاحيتها ومسح بيانات اعتمادها —
// نفس نمط triggerScanQueue/scheduleTriggerScan أعلاه حرفياً.
const QR_TRIAL_EXPIRY_SCAN_INTERVAL_MS = 30 * 60 * 1000;
const qrTrialExpiryWorker = new Worker("whatsapp-qr-trial-expiry-scan", async () => scanAndExpireQrTrials(), {
  connection: redisConnection,
  concurrency: 1,
});
qrTrialExpiryWorker.on("failed", (job, err) => console.error("❌ فشل فحص انتهاء القنوات التجريبية:", err.message));

const qrTrialExpiryQueue = new Queue("whatsapp-qr-trial-expiry-scan", { connection: redisConnection });
async function scheduleQrTrialExpiryScan() {
  await qrTrialExpiryQueue.add("scan", {}, {
    repeat: { every: QR_TRIAL_EXPIRY_SCAN_INTERVAL_MS },
    jobId: "recurring-qr-trial-expiry-scan",
  });
}
scheduleQrTrialExpiryScan().catch((err) => console.error("❌ تعذّرت جدولة فحص انتهاء القنوات التجريبية:", err));

// استئناف جلسات QR المتصلة فعلياً وقت توقف عملية العامل السابقة — الـsocket الحي يعيش في الذاكرة فقط
// (يُفقَد عند أي إعادة تشغيل)، لكن بيانات الاعتماد محفوظة مشفَّرة في القاعدة (encryptedSessionData)،
// فيُعاد الاتصال تلقائياً بلا حاجة لمسح QR جديد — بدون هذا، أي إعادة تشغيل للعامل كانت ستترك القناة
// "متصلة" ظاهرياً في القاعدة لكن بلا socket فعلي يستقبل/يرسل أي شيء.
async function resumeConnectedQrSessions() {
  const connected = await superAdminDb.integration.findMany({
    where: { provider: "WHATSAPP_QR", status: "CONNECTED" },
    select: { tenantId: true },
  });
  for (const { tenantId } of connected) {
    try {
      await startWhatsappQrSession(tenantId);
    } catch (err) {
      console.error(`❌ فشل استئناف جلسة القناة التجريبية للمستأجر ${tenantId}:`, err);
    }
  }
}
resumeConnectedQrSessions().catch((err) => console.error("❌ فشل استئناف جلسات القناة التجريبية:", err));

// فحص دوري (كل 10 دقائق) لإعادة أي محادثة شات بوت واقفة عند عقدة "سؤال" منذ وقت طويل بلا رد إلى
// تحكّم بشري — بنفس نمط triggerScanQueue/scheduleTriggerScan أعلاه حرفياً.
const CHATBOT_TIMEOUT_SCAN_INTERVAL_MS = 10 * 60 * 1000;
const chatbotTimeoutWorker = new Worker("chatbot-session-timeout-scan", async () => scanAndResetStuckChatbotSessions(), {
  connection: redisConnection,
  concurrency: 1,
});
chatbotTimeoutWorker.on("failed", (job, err) => console.error("❌ فشل فحص جلسات الشات بوت العالقة:", err.message));

const chatbotTimeoutQueue = new Queue("chatbot-session-timeout-scan", { connection: redisConnection });
async function scheduleChatbotTimeoutScan() {
  await chatbotTimeoutQueue.add("scan", {}, {
    repeat: { every: CHATBOT_TIMEOUT_SCAN_INTERVAL_MS },
    jobId: "recurring-chatbot-timeout-scan",
  });
}
scheduleChatbotTimeoutScan().catch((err) => console.error("❌ تعذّرت جدولة فحص جلسات الشات بوت العالقة:", err));

// فحص دوري (كل ساعة) لتحويل أي اشتراك تجاوز currentPeriodEnd دون تجديد لحالة PAST_DUE —
// بنفس نمط triggerScanQueue/scheduleTriggerScan أعلاه حرفياً. ساعة كافية هنا (وليس كل 10 دقائق
// كمهام أخرى أعلاه) لأن دورة الفوترة شهرية، لا حاجة لدقة زمنية عالية.
const SUBSCRIPTION_EXPIRY_SCAN_INTERVAL_MS = 60 * 60 * 1000;
const subscriptionExpiryWorker = new Worker("subscription-expiry-scan", async () => scanAndExpireSubscriptions(), {
  connection: redisConnection,
  concurrency: 1,
});
subscriptionExpiryWorker.on("failed", (job, err) => console.error("❌ فشل فحص انتهاء الاشتراكات:", err.message));

const subscriptionExpiryQueue = new Queue("subscription-expiry-scan", { connection: redisConnection });
async function scheduleSubscriptionExpiryScan() {
  await subscriptionExpiryQueue.add("scan", {}, {
    repeat: { every: SUBSCRIPTION_EXPIRY_SCAN_INTERVAL_MS },
    jobId: "recurring-subscription-expiry-scan",
  });
}
scheduleSubscriptionExpiryScan().catch((err) => console.error("❌ تعذّرت جدولة فحص انتهاء الاشتراكات:", err));

// اعتراف تدريجي بالإيراد المؤجل (كل 6 ساعات — دقة كافية لدورة فوترة شهرية/سنوية، لا حاجة لتشغيل
// أدق) — بنفس نمط triggerScanQueue/scheduleTriggerScan أعلاه حرفياً.
const REVENUE_RECOGNITION_INTERVAL_MS = 6 * 60 * 60 * 1000;
const revenueRecognitionWorker = new Worker("revenue-recognition-scan", async () => recognizeRevenueForActiveInvoices(), {
  connection: redisConnection,
  concurrency: 1,
});
revenueRecognitionWorker.on("failed", (job, err) => console.error("❌ فشل الاعتراف الدوري بالإيراد:", err.message));

const revenueRecognitionQueue = new Queue("revenue-recognition-scan", { connection: redisConnection });
async function scheduleRevenueRecognitionScan() {
  await revenueRecognitionQueue.add("scan", {}, {
    repeat: { every: REVENUE_RECOGNITION_INTERVAL_MS },
    jobId: "recurring-revenue-recognition-scan",
  });
}
scheduleRevenueRecognitionScan().catch((err) => console.error("❌ تعذّرت جدولة الاعتراف بالإيراد:", err));

// مصالحة دورية لعمولات برنامج التسويق بالعمولة (إنشاء عمولات جديدة لفواتير مدفوعة حديثاً لتجّار
// مُحالين، ترقية العمولات المستحقة بعد Net 30، وترقية مستويات المسوّقين) — كل ساعة (أدق من الاعتراف
// بالإيراد عمداً: المسوّق يتابع لوحته وينتظر ترقية حالة "قيد الانتظار" لعمولاته أسرع من دورة محاسبية).
const AFFILIATE_COMMISSION_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const affiliateCommissionSyncWorker = new Worker("affiliate-commission-sync", async () => syncAffiliateCommissions(), {
  connection: redisConnection,
  concurrency: 1,
});
affiliateCommissionSyncWorker.on("failed", (job, err) => console.error("❌ فشلت مزامنة عمولات المسوّقين:", err.message));

const affiliateCommissionSyncQueue = new Queue("affiliate-commission-sync", { connection: redisConnection });
async function scheduleAffiliateCommissionSync() {
  await affiliateCommissionSyncQueue.add("scan", {}, {
    repeat: { every: AFFILIATE_COMMISSION_SYNC_INTERVAL_MS },
    jobId: "recurring-affiliate-commission-sync",
  });
}
scheduleAffiliateCommissionSync().catch((err) => console.error("❌ تعذّرت جدولة مزامنة عمولات المسوّقين:", err));

console.log("🚀 عامل إرسال الحملات يعمل الآن، بانتظار المهام...");
console.log(`⏱️  فحص الحملات الآلية مجدوَل كل ${TRIGGER_SCAN_INTERVAL_MS / 60000} دقائق`);
