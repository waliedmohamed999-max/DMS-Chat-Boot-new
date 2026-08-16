"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { enqueueCampaignSend } from "@/lib/queue/campaignQueue";
import { getTenantCampaignLimits, isUnlimited } from "@/lib/campaigns/limits";
import { resolveAudienceWhere, type SegmentFilter } from "@/lib/campaigns/audience";
import { scanTriggeredCampaigns } from "@/lib/campaigns/triggerEngine";
import { CampaignLimitError } from "@/lib/campaigns/errors";
import { importAudienceFromExcel } from "@/lib/campaigns/audienceImport";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import type { CampaignType, TriggerEvent } from "@prisma/client";

export type CreateCampaignInput = {
  name: string;
  type: CampaignType;
  // ONE_TIME فقط
  audienceType?: "ALL" | "SEGMENT";
  segmentFilter?: SegmentFilter;
  scheduleMode?: "now" | "later";
  scheduledAt?: string; // ISO
  // TRIGGERED فقط
  triggerEvent?: TriggerEvent;
  triggerConfig?: { inactiveDays?: number };
  templateId: string;
};

/** يُستدعى مباشرة من معالج إنشاء الحملة (خطوة الجمهور) لعرض عدد المستلمين الفعلي فوراً قبل الإرسال. */
export async function previewAudienceCount(input: { audienceType: "ALL" | "SEGMENT"; filter: SegmentFilter }): Promise<number> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "campaigns.view");
  const tenantId = session.user.tenantId;
  return withTenant(tenantId, (tx) => tx.contact.count({ where: resolveAudienceWhere(tenantId, input.audienceType, input.filter) }));
}

export type ImportCampaignAudienceResult =
  | { success: true; tagId: string; imported: number; updated: number; skipped: number; errors: { row: number; reason: string }[] }
  | { success: false; error: string };

/**
 * يُستدعى من خطوة الجمهور في معالج إنشاء الحملة عند اختيار "استيراد قائمة من Excel" — يستورد جهات
 * الاتصال ويسم هذه الدفعة بوسم فريد؛ المعالج يضبط بعدها segmentFilter.tagIds بهذا الوسم مباشرة،
 * فيمر الجمهور المستورَد عبر نفس resolveAudienceWhere/حدود الباقة الموجودة أصلاً بلا أي تعديل إضافي.
 */
export async function importCampaignAudienceFromExcel(formData: FormData): Promise<ImportCampaignAudienceResult> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "campaigns.manage");

  const rateLimit = await checkTenantRateLimit(session.user.tenantId, "bulk-import", 5, 3600);
  if (!rateLimit.allowed) {
    return { success: false, error: "عدد عمليات الاستيراد كبير جداً خلال ساعة — حاول مرة أخرى لاحقاً." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "لم يتم اختيار ملف صالح." };
  }

  const result = await importAudienceFromExcel(session.user.tenantId, file);
  if (!result.success) return result;

  await writeAuditLog({
    tenantId: session.user.tenantId, userId: session.user.id,
    action: "campaign.audience_import", targetType: "Tag", targetId: result.tagId,
    metaJson: { imported: result.imported, updated: result.updated, skipped: result.skipped },
  });

  return result;
}

const TRIGGER_ABANDONED_CART_LOOKBACK_DAYS = 30;

/** يُستدعى من خطوة "الحدث المُشغِّل" في المعالج لعرض عدد المرشحين المطابقين حالياً (تقديري وليس نهائياً — الحملة الآلية مستمرة). */
export async function previewTriggerMatchCount(triggerEvent: TriggerEvent, config: { inactiveDays?: number }): Promise<number> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "campaigns.view");
  const tenantId = session.user.tenantId;

  return withTenant(tenantId, async (tx) => {
    if (triggerEvent === "ABANDONED_CART") {
      const cutoff = new Date(Date.now() - TRIGGER_ABANDONED_CART_LOOKBACK_DAYS * 86400000);
      return tx.order.count({ where: { tenantId, status: "ABANDONED_CART", recoveryMessageSentAt: null, createdAt: { gte: cutoff } } });
    }
    const inactiveDays = config.inactiveDays ?? 14;
    const cutoff = new Date(Date.now() - inactiveDays * 86400000);
    return tx.contact.count({ where: { tenantId, marketingOptIn: true, conversations: { none: { lastMessageAt: { gte: cutoff } } } } });
  });
}

export async function createCampaign(input: CreateCampaignInput): Promise<{ campaignId: string }> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "campaigns.manage");
  const tenantId = session.user.tenantId;

  const name = input.name.trim();
  if (!name) throw new Error("اسم الحملة مطلوب");
  if (!input.templateId) throw new Error("يجب اختيار قالب رسالة");

  const limits = await getTenantCampaignLimits(tenantId);

  // إنفاذ فعلي من الخادم لدورة حياة الاشتراك (بند 3 في البرومنت): اشتراك منتهي الفترة
  // (PAST_DUE، يُحدَّث تلقائياً عبر scanAndExpireSubscriptions) أو مُلغى أو مُوقَف مؤقتاً (PAUSED، من
  // تدفق الاحتفاظ بالعميل عند الإلغاء) لا يُنشئ حملات جديدة — لا يمنع تسجيل الدخول أو إدارة الفوترة
  // نفسها، فقط الإرسال الفعلي.
  if (limits.subscriptionStatus === "PAST_DUE" || limits.subscriptionStatus === "CANCELLED" || limits.subscriptionStatus === "PAUSED") {
    throw new CampaignLimitError(
      limits.subscriptionStatus === "PAUSED"
        ? "اشتراكك مُوقَف مؤقتاً — استأنفه من صفحة الفوترة لإنشاء حملات جديدة."
        : "اشتراكك منتهي أو متأخر السداد — رجاءً جدّد باقتك من صفحة الفوترة لإنشاء حملات جديدة."
    );
  }

  const campaignId = await withTenant(tenantId, async (tx) => {
    // فرض من الخادم: القالب يجب أن يكون معتمداً فعلياً (بند 4 في البرومنت) — وليس فقط إخفاء
    // القوالب غير المعتمدة من قائمة الاختيار في الواجهة.
    const template = await tx.messageTemplate.findUnique({ where: { id: input.templateId, tenantId } });
    if (!template || template.status !== "APPROVED") {
      throw new Error("لا يمكن استخدام قالب غير معتمد من Meta في أي حملة.");
    }

    // حد عدد الحملات شهرياً — يُحسب ضمن فترة الاشتراك الحالية
    if (!isUnlimited(limits.maxCampaignsPerMonth)) {
      const subscription = await tx.subscription.findUnique({ where: { tenantId } });
      const periodStart = subscription?.currentPeriodStart ?? new Date(0);
      const campaignsThisPeriod = await tx.campaign.count({ where: { tenantId, createdAt: { gte: periodStart } } });
      if (campaignsThisPeriod >= limits.maxCampaignsPerMonth) {
        throw new CampaignLimitError(
          `وصلت للحد الأقصى لعدد الحملات في باقتك الحالية (${limits.maxCampaignsPerMonth} حملة/شهر). رقّي باقتك لإنشاء المزيد.`
        );
      }
    }

    if (input.type === "TRIGGERED") {
      if (!input.triggerEvent) throw new Error("يجب اختيار الحدث المُشغِّل للحملة الآلية");

      const campaign = await tx.campaign.create({
        data: {
          tenantId, name, templateId: input.templateId,
          type: "TRIGGERED", audienceType: "SEGMENT", status: "ACTIVE",
          triggerEvent: input.triggerEvent, triggerConfigJson: input.triggerConfig ?? {},
        },
      });
      return campaign.id;
    }

    // ONE_TIME: يجب فحص حجم الجمهور مقابل حد الباقة وحصة الرسائل المتبقية *قبل* الإنشاء —
    // Soft-lock فعلي من الخادم، وليس مجرد تعطيل زر في الواجهة (بند 2 في البرومنت).
    const audienceType = input.audienceType ?? "ALL";
    const filter = audienceType === "SEGMENT" ? (input.segmentFilter ?? {}) : null;
    const audienceCount = await tx.contact.count({ where: resolveAudienceWhere(tenantId, audienceType, filter) });

    if (audienceCount === 0) throw new Error("الجمهور المستهدف فارغ — عدّل الفلاتر واختر جمهوراً غير فارغ.");

    if (!isUnlimited(limits.maxAudiencePerCampaign) && audienceCount > limits.maxAudiencePerCampaign) {
      throw new CampaignLimitError(
        `حجم الجمهور (${audienceCount}) يتجاوز الحد المسموح لحملة واحدة في باقتك (${limits.maxAudiencePerCampaign}). رقّي باقتك أو قلّص الجمهور.`
      );
    }

    const remainingQuota = limits.maxMessagesPerMonth - limits.messagesUsedThisPeriod;
    if (audienceCount > remainingQuota) {
      throw new CampaignLimitError(
        `حجم الجمهور (${audienceCount}) يتجاوز رصيدك المتبقي من الرسائل هذا الشهر (${Math.max(0, remainingQuota)}). رقّي باقتك لإرسال هذه الحملة.`
      );
    }

    let segmentId: string | null = null;
    if (audienceType === "SEGMENT") {
      const segment = await tx.segment.create({
        data: { tenantId, name: `شريحة حملة: ${name}`, filterJson: filter as never },
      });
      segmentId = segment.id;
    }

    const scheduledAt = input.scheduleMode === "later" && input.scheduledAt ? new Date(input.scheduledAt) : null;
    const campaign = await tx.campaign.create({
      data: {
        tenantId, name, templateId: input.templateId, type: "ONE_TIME",
        audienceType, segmentId, status: "SCHEDULED", scheduledAt,
      },
    });

    // إتمام تتبّع "مصدر جهة الاتصال" بأثر رجعي: الجمهور المستورَد عبر "استيراد قائمة من Excel" في
    // خطوة الجمهور يُوسَم بوسم داخلي (isSystem) *قبل* وجود Campaign حقيقية (لا معرّف حملة متاح
    // وقتها بعد) — بمجرد إنشاء الحملة فعلياً هنا، نربط كل جهة اتصال بهذا الوسم بالحملة الحقيقية، لكن
    // فقط إن لم يكن لها مصدر مسجَّل مسبقاً (لا نُعيد كتابة تاريخ جهة اتصال حقيقي أُضيفت من مصدر آخر).
    if (filter?.tagIds?.length === 1) {
      const tag = await tx.tag.findUnique({ where: { id: filter.tagIds[0] } });
      if (tag?.isSystem) {
        await tx.contact.updateMany({
          where: { tenantId, sourceCampaignId: null, tags: { some: { tagId: tag.id } } },
          data: { sourceCampaignId: campaign.id },
        });
      }
    }

    const delayMs = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;
    await enqueueCampaignSend({ tenantId, campaignId: campaign.id }, delayMs > 0 ? { delayMs } : undefined);

    return campaign.id;
  });

  await writeAuditLog({ tenantId, userId: session.user.id, action: "campaign.create", targetType: "Campaign", targetId: campaignId, metaJson: { type: input.type } });

  revalidatePath("/dashboard/campaigns");

  if (input.type === "TRIGGERED") {
    // فحص فوري بعد التفعيل مباشرة — يمنح ملاحظة فورية بدل انتظار دورة الفحص الدورية (5 دقائق).
    await scanTriggeredCampaigns(tenantId, campaignId);
  }

  return { campaignId };
}

export async function setTriggeredCampaignActive(campaignId: string, active: boolean) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "campaigns.manage");
  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId, tenantId } });
    if (campaign.type !== "TRIGGERED") throw new Error("هذا الإجراء متاح فقط للحملات الآلية");
    await tx.campaign.update({ where: { id: campaignId }, data: { status: active ? "ACTIVE" : "PAUSED" } });
  });

  await writeAuditLog({
    tenantId, userId: session.user.id,
    action: active ? "campaign.resume" : "campaign.pause", targetType: "Campaign", targetId: campaignId,
  });

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
}

/** يفحص حملة آلية بعينها الآن فوراً بدل انتظار الفحص الدوري — لأغراض تجربة فورية وتحقق فعلي. */
export async function runTriggerScanNow(campaignId: string) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "campaigns.manage");

  await scanTriggeredCampaigns(session.user.tenantId, campaignId);

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${campaignId}`);
}

export async function retryFailedRecipients(campaignId: string) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "campaigns.manage");
  const tenantId = session.user.tenantId;

  const contactIds = await withTenant(tenantId, async (tx) => {
    await tx.campaign.findUniqueOrThrow({ where: { id: campaignId, tenantId } }); // يتحقق من الملكية
    const failed = await tx.campaignRecipient.findMany({ where: { campaignId, status: "FAILED" }, select: { id: true, contactId: true } });
    if (failed.length === 0) return [];

    await tx.campaignRecipient.deleteMany({ where: { id: { in: failed.map((f) => f.id) } } });
    await tx.campaign.update({ where: { id: campaignId }, data: { failedCount: { decrement: failed.length } } });
    return failed.map((f) => f.contactId);
  });

  if (contactIds.length > 0) {
    await enqueueCampaignSend({ tenantId, campaignId, contactIds });
  }

  await writeAuditLog({ tenantId, userId: session.user.id, action: "campaign.retry_failed", targetType: "Campaign", targetId: campaignId, metaJson: { retried: contactIds.length } });

  revalidatePath(`/dashboard/campaigns/${campaignId}`);
}

export async function duplicateCampaign(campaignId: string) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "campaigns.manage");

  const campaign = await withTenant(session.user.tenantId, (tx) =>
    tx.campaign.findUniqueOrThrow({ where: { id: campaignId, tenantId: session.user.tenantId } })
  );

  redirect(`/dashboard/campaigns/new?duplicateFrom=${campaign.id}`);
}
