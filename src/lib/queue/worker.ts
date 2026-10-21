import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/queue/connection";
import { IDLE_FRIENDLY_WORKER_OPTS, schedulePeriodic } from "@/lib/queue/periodic";
import "@/lib/queue/integrationMaintenance"; // صيانة يومية لرموز متاجر سلة وزد
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
import { scanAndResetStuckChatbotSessions } from "@/lib/chatbot/timeoutScan";
import { scanAndExpireSubscriptions } from "@/lib/billing/expireSubscriptions";
import { recognizeRevenueForActiveInvoices } from "@/lib/accounting/revenueRecognition";
import { syncAffiliateCommissions } from "@/lib/affiliates/commissionSync";
import { scanAnnouncementLifecycle } from "@/lib/announcements/lifecycle";
import type { Prisma } from "@prisma/client";

// حد إرسال لكل مستأجر: 60 رسالة كل 10 ثوانٍ، بحد أقصى منطقي لتجريب الحملات دون أن تحتكر
// حملة تاجر واحد عامل الإرسال المشترك بين كل المستأجرين.
const TENANT_SEND_LIMIT = 60;
const TENANT_SEND_WINDOW_SECONDS = 10;
// فحص دوري للحملات الآلية (كل 5 دقائق) — يعادل "cron" حقيقي عبر مهمة BullMQ متكررة، دون
// الحاجة لخدمة جدولة منفصلة. راجع lib/campaigns/triggerEngine.ts للمنطق الفعلي.
const TRIGGER_SCAN_INTERVAL_MS = 5 * 60 * 1000;

type CampaignWithRelations = Prisma.CampaignGetPayload<{ include: { segment: true; template: true } }>;

/**
 * يرسل رسالة واحدة لجهة اتصال ضمن حملة، ويحدّث حالة المستلم + عدادات الحملة + حصة الرسائل الشهرية.
 * "blocked" = لم يُرسل شيء لسبب يخص الحملة كلها (رصيد محفظة غير كافٍ / سعر غير مضبوط في قناة 360dialog):
 * لا يُسجَّل المستلم كفاشل ولا تُحتسب الحصة، فيُرسَل له عند استئناف الحملة بعد الشحن.
 */
async function sendToContact(
  tx: Prisma.TransactionClient,
  tenantId: string,
  campaign: CampaignWithRelations,
  contact: { id: string; name: string; phoneE164: string }
): Promise<"sent" | "failed" | "blocked"> {
  const rateLimit = await checkTenantRateLimit(tenantId, "campaign-send", TENANT_SEND_LIMIT, TENANT_SEND_WINDOW_SECONDS);
  if (!rateLimit.allowed) {
    throw new Error(`تجاوز حد الإرسال المسموح للمستأجر ${tenantId} — سيُعاد المحاولة تلقائياً`);
  }

  const personalizedBody = campaign.template.bodyText.replace("{{1}}", contact.name);
  const adapter = await resolveWhatsappAdapter(tenantId);
  // القالب المعتمد نفسه (اسم/لغة/متغيرات) وفئته للتسعير — قناة 360dialog ترسله كقالب فعلي وتخصم سعره من
  // المحفظة؛ القنوات الأخرى تتجاهل هذه الخيارات وترسل النص كما كانت.
  const result = await adapter.sendMessage(tenantId, contact.phoneE164, personalizedBody, undefined, {
    category: toTemplateCategory(campaign.template.category),
    template: {
      name: campaign.template.name,
      language: campaign.template.language,
      bodyParams: campaign.template.bodyText.includes("{{1}}") ? [contact.name] : [],
    },
  });
  if (result.errorCode === "INSUFFICIENT_BALANCE" || result.errorCode === "RATE_NOT_CONFIGURED") return "blocked";
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
        // رصيد المحفظة نفد: يبقى باقي المستلمين PENDING ويُكملون عند استئناف الحملة بعد الشحن.
        if ((await sendToContact(tx, tenantId, campaign, contact)) === "blocked") break;
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
    let walletBlocked = false;
    for (const contact of contacts) {
      const existing = await tx.campaignRecipient.findUnique({
        where: { campaignId_contactId: { campaignId, contactId: contact.id } },
      });
      if (existing) continue;

      if (remainingQuota <= 0) { quotaExhausted = true; break; }
      if ((await sendToContact(tx, tenantId, campaign, contact)) === "blocked") { walletBlocked = true; break; }
      remainingQuota--;
    }

    // نفاد رصيد المحفظة ⇐ PAUSED (وليس FAILED): الاستئناف بعد الشحن يعيد تشغيل نفس المهمة، والمستلمون
    // الذين وصلتهم الرسالة مسبقاً يُتخطَّون (CampaignRecipient قائم) فيُكمل من حيث توقف تماماً.
    await tx.campaign.update({
      where: { id: campaignId },
      data: { status: walletBlocked ? "PAUSED" : quotaExhausted ? "FAILED" : "COMPLETED" },
    });
  });
}

function toTemplateCategory(category: string): "MARKETING" | "UTILITY" | "AUTHENTICATION" {
  const c = category.toUpperCase();
  return c === "UTILITY" || c === "AUTHENTICATION" ? c : "MARKETING";
}

export const campaignWorker = new Worker<CampaignSendJob>(
  "campaign-send",
  async (job) => processCampaign(job),
  { connection: redisConnection, concurrency: 2, ...IDLE_FRIENDLY_WORKER_OPTS }
);

campaignWorker.on("completed", (job) => console.log(`✅ اكتملت مهمة إرسال الحملة ${job.data.campaignId}`));
campaignWorker.on("failed", (job, err) => console.error(`❌ فشلت مهمة إرسال الحملة ${job?.data.campaignId}:`, err.message));

// محاكاة تقدُّم حالة الرسائل الصادرة في وضع Sandbox (SENT → DELIVERED → READ) — انظر
// lib/queue/messageStatusQueue.ts. يُستخدم نفس منطق تحديث الحالة الذي يستخدمه webhook حقيقي وارد.
const messageStatusWorker = new Worker<MessageStatusSimJob>(
  "message-status-sim",
  async (job) => {
    const { tenantId, waMessageId, status, failureReason } = job.data;
    await withTenant(tenantId, (tx) => applyStatusUpdate(tx, tenantId, { waMessageId, status, timestamp: new Date(), failureReason }));
  },
  { connection: redisConnection, concurrency: 5, ...IDLE_FRIENDLY_WORKER_OPTS }
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
  { connection: redisConnection, concurrency: 5, ...IDLE_FRIENDLY_WORKER_OPTS }
);
templateStatusWorker.on("failed", (job, err) => console.error("❌ فشل تحديث حالة قالب محاكاة:", err.message));

// ========================= الفحوص الدورية (مُجدوِل داخل العملية — لا عمّال BullMQ خاملين) =========================

// الحملات الآلية عبر كل المستأجرين.
schedulePeriodic("campaign-trigger-scan", TRIGGER_SCAN_INTERVAL_MS, () => scanAllTenantsTriggeredCampaigns());
// جلسات الشات بوت العالقة.
schedulePeriodic("chatbot-session-timeout-scan", 10 * 60 * 1000, () => scanAndResetStuckChatbotSessions());
// تحويل أي اشتراك تجاوز currentPeriodEnd دون تجديد لحالة PAST_DUE — ساعة كافية لدورة فوترة شهرية.
schedulePeriodic("subscription-expiry-scan", 60 * 60 * 1000, () => scanAndExpireSubscriptions());
// اعتراف تدريجي بالإيراد المؤجل.
schedulePeriodic("revenue-recognition-scan", 6 * 60 * 60 * 1000, () => recognizeRevenueForActiveInvoices());
// مصالحة عمولات برنامج التسويق بالعمولة (المسوّق يتابع لوحته فساعة لا دورة محاسبية).
schedulePeriodic("affiliate-commission-sync", 60 * 60 * 1000, () => syncAffiliateCommissions());
// دورة حياة إعلانات المنصة (تفعيل المجدوَل + إنهاء صلاحية المنتهي).
schedulePeriodic("announcement-lifecycle-scan", 5 * 60 * 1000, () => scanAnnouncementLifecycle());

console.log("🚀 عامل إرسال الحملات يعمل الآن، بانتظار المهام...");
console.log(`⏱️  فحص الحملات الآلية مجدوَل كل ${TRIGGER_SCAN_INTERVAL_MS / 60000} دقائق`);
