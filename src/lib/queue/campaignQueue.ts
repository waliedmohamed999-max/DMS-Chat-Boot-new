import { Queue } from "bullmq";
import { redisConnection } from "@/lib/queue/connection";

export type CampaignSendJob = {
  tenantId: string;
  campaignId: string;
  // محدَّد فقط عند إطلاق حملة آلية لعدد جهات اتصال بعينها استجابةً لحدث مُشغِّل (lib/campaigns/triggerEngine.ts).
  // إن غاب، العامل يحل جمهور الحملة بالكامل من الشريحة/الكل (مسار الحملة لمرة واحدة العادي).
  contactIds?: string[];
};

export const campaignQueue = new Queue<CampaignSendJob>("campaign-send", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export async function enqueueCampaignSend(job: CampaignSendJob, options?: { delayMs?: number }) {
  await campaignQueue.add("send", job, options?.delayMs ? { delay: options.delayMs } : undefined);
}
