import type { Prisma } from "@prisma/client";

const MIN_SAMPLE_SIZE = 20;

/**
 * يقترح أفضل ساعة إرسال بناءً على توزيع رسائل العملاء الفعلية الواردة (INBOUND) لهذا التاجر —
 * افتراض أن العميل أكثر تفاعلاً في الساعات التي يبادر فيها هو بالتواصل. عند نقص البيانات (تاجر
 * جديد) يُعاد null صراحةً بدل تلفيق رقم عشوائي كأنه رؤية حقيقية — مطابقةً لمبدأ "لا بيانات مصطنعة
 * تُعرض كأنها حقيقية" الموثّق سابقاً في DECISIONS.md لتحليلات الشات بوت.
 */
export async function suggestBestSendHour(tx: Prisma.TransactionClient, tenantId: string): Promise<number | null> {
  const inboundMessages = await tx.message.findMany({
    where: { tenantId, direction: "INBOUND" },
    select: { createdAt: true },
    take: 500,
  });

  if (inboundMessages.length < MIN_SAMPLE_SIZE) return null;

  const hourCounts = new Array(24).fill(0);
  for (const m of inboundMessages) hourCounts[m.createdAt.getHours()]++;

  let bestHour = 0;
  for (let h = 1; h < 24; h++) {
    if (hourCounts[h] > hourCounts[bestHour]) bestHour = h;
  }
  return bestHour;
}
