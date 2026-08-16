import type { Prisma } from "@prisma/client";

/** نافذة الإسناد: طلب يُحسب "ناتجاً عن الحملة" إن حدث خلال هذه المدة بعد إرسال الرسالة للعميل. */
const ATTRIBUTION_WINDOW_DAYS = 7;
const CONVERTING_ORDER_STATUSES = ["PAID", "SHIPPED", "DELIVERED"] as const;

/**
 * يربط مستلمي حملة لم يُسند لهم تحويل بعد بأي طلب فعلي حدث لنفس جهة الاتصال خلال نافذة الإسناد
 * بعد استلامهم الرسالة. يُستدعى بشكل حي (lazy) عند فتح صفحة تفاصيل الحملة — وليس عبر مهمة خلفية
 * دورية — لأن حجم البيانات هنا صغير بما يكفي ليبقى حساب مباشر عند كل زيارة، وهذا يضمن أن رقم
 * "الإيراد الناتج عن هذه الحملة" حي دائماً وليس عداداً مخزَّناً قد يتأخر عن الواقع (نفس مبدأ
 * "تحليلات صادقة وليست مصطنعة" الموثّق سابقاً في DECISIONS.md).
 */
export async function linkCampaignConversions(tx: Prisma.TransactionClient, campaignId: string): Promise<void> {
  const pendingRecipients = await tx.campaignRecipient.findMany({
    where: {
      campaignId,
      convertedOrderId: null,
      sentAt: { not: null },
      status: { in: ["SENT", "DELIVERED", "READ", "REPLIED"] },
    },
  });

  for (const recipient of pendingRecipients) {
    if (!recipient.sentAt) continue;
    const windowEnd = new Date(recipient.sentAt.getTime() + ATTRIBUTION_WINDOW_DAYS * 86400000);

    const matchingOrder = await tx.order.findFirst({
      where: {
        contactId: recipient.contactId,
        status: { in: [...CONVERTING_ORDER_STATUSES] },
        createdAt: { gte: recipient.sentAt, lte: windowEnd },
      },
      orderBy: { createdAt: "asc" },
    });

    if (matchingOrder) {
      await tx.campaignRecipient.update({
        where: { id: recipient.id },
        data: { convertedOrderId: matchingOrder.id, conversionRevenueSar: matchingOrder.totalSar },
      });
    }
  }
}
