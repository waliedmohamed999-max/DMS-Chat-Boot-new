import { withTenant, superAdminDb } from "@/lib/db";
import { enqueueCampaignSend } from "@/lib/queue/campaignQueue";

const ABANDONED_CART_LOOKBACK_DAYS = 30; // حد أمان لتفادي استهداف سلات قديمة جداً لأول مرة تُفعَّل فيها الحملة
const DEFAULT_INACTIVE_DAYS = 14;

export type TriggerScanResult = { campaignId: string; campaignName: string; newRecipients: number };

/**
 * يفحص كل الحملات الآلية (TRIGGERED) النشطة (ACTIVE) لمستأجر معيّن، ويستهدف أي جهة اتصال/طلب
 * جديد يطابق الحدث المُشغِّل ولم يُستهدف من قبل بنفس الحملة (القيد الفريد campaignId+contactId
 * يمنع الاستهداف المزدوج تلقائياً على مستوى قاعدة البيانات — دفاع طبقة إضافية وليس فقط منطق هنا).
 * يُستدعى من مهمة BullMQ متكررة (كل 5 دقائق، src/lib/queue/worker.ts) ومن زر "فحص الآن" اليدوي
 * في واجهة الحملات الآلية لأغراض الاختبار الفعلي الفوري.
 */
export async function scanTriggeredCampaigns(tenantId: string, onlyCampaignId?: string): Promise<TriggerScanResult[]> {
  const results: TriggerScanResult[] = [];

  await withTenant(tenantId, async (tx) => {
    const campaigns = await tx.campaign.findMany({
      where: {
        tenantId,
        type: "TRIGGERED",
        status: "ACTIVE",
        ...(onlyCampaignId ? { id: onlyCampaignId } : {}),
      },
    });

    for (const campaign of campaigns) {
      let newContactIds: string[] = [];

      if (campaign.triggerEvent === "ABANDONED_CART") {
        const cutoff = new Date(Date.now() - ABANDONED_CART_LOOKBACK_DAYS * 86400000);
        const orders = await tx.order.findMany({
          where: { tenantId, status: "ABANDONED_CART", recoveryMessageSentAt: null, createdAt: { gte: cutoff } },
        });

        for (const order of orders) {
          const existing = await tx.campaignRecipient.findUnique({
            where: { campaignId_contactId: { campaignId: campaign.id, contactId: order.contactId } },
          });
          if (existing) continue;

          await tx.campaignRecipient.create({
            data: { campaignId: campaign.id, contactId: order.contactId, status: "PENDING" },
          });
          await tx.order.update({ where: { id: order.id }, data: { recoveryMessageSentAt: new Date() } });
          newContactIds.push(order.contactId);
        }
      } else if (campaign.triggerEvent === "CUSTOMER_INACTIVE") {
        const config = campaign.triggerConfigJson as { inactiveDays?: number } | null;
        const inactiveDays = config?.inactiveDays ?? DEFAULT_INACTIVE_DAYS;
        const cutoff = new Date(Date.now() - inactiveDays * 86400000);

        const candidates = await tx.contact.findMany({
          where: {
            tenantId,
            marketingOptIn: true,
            conversations: { none: { lastMessageAt: { gte: cutoff } } },
            campaignRecipients: { none: { campaignId: campaign.id } },
          },
        });

        for (const contact of candidates) {
          await tx.campaignRecipient.create({ data: { campaignId: campaign.id, contactId: contact.id, status: "PENDING" } });
          newContactIds.push(contact.id);
        }
      }

      if (newContactIds.length > 0) {
        await enqueueCampaignSend({ tenantId, campaignId: campaign.id, contactIds: newContactIds });
      }
      results.push({ campaignId: campaign.id, campaignName: campaign.name, newRecipients: newContactIds.length });
    }
  });

  return results;
}

/**
 * يفحص كل المستأجرين الذين لديهم حملة آلية نشطة واحدة على الأقل — يُستدعى من مهمة BullMQ
 * المتكررة فقط (عملية العامل المنفصلة `npm run worker`)، وليس من أي مسار طلب تاجر عادي، لذا
 * يستخدم `superAdminDb` (BYPASSRLS) حصراً لتعداد المستأجرين عبر الحدود، ثم يُفوّض التنفيذ الفعلي
 * لكل مستأجر إلى scanTriggeredCampaigns التي تمر عبر withTenant() كالمعتاد.
 */
export async function scanAllTenantsTriggeredCampaigns(): Promise<void> {
  const tenantIds = await superAdminDb.campaign.findMany({
    where: { type: "TRIGGERED", status: "ACTIVE" },
    distinct: ["tenantId"],
    select: { tenantId: true },
  });

  for (const { tenantId } of tenantIds) {
    try {
      await scanTriggeredCampaigns(tenantId);
    } catch (err) {
      console.error(`❌ فشل فحص الحملات الآلية للمستأجر ${tenantId}:`, err instanceof Error ? err.message : err);
    }
  }
}
