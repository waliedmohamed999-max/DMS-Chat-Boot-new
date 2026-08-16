import { Queue } from "bullmq";
import { redisConnection } from "@/lib/queue/connection";

export type TemplateStatusSimJob = {
  tenantId: string;
  templateId: string;
};

export const templateStatusQueue = new Queue<TemplateStatusSimJob>("template-status-sim", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, removeOnComplete: 200, removeOnFail: 200 },
});

/**
 * يجدول قرار مراجعة واقعي لقالب أُرسل حديثاً لـMeta (وضع Sandbox فقط) — بعد تأخير قصير يحاكي
 * وقت مراجعة Meta الفعلي، بدل اعتماد فوري مصطنع يفقد واقعية "قيد المراجعة" الظاهرة للتاجر.
 */
export async function scheduleTemplateReviewDecision(tenantId: string, templateId: string) {
  await templateStatusQueue.add("decide", { tenantId, templateId }, { delay: 6000 });
}
