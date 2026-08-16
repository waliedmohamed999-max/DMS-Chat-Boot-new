import { Queue } from "bullmq";
import { redisConnection } from "@/lib/queue/connection";

export type MessageStatusSimJob = {
  tenantId: string;
  waMessageId: string;
  status: "delivered" | "read" | "failed";
  failureReason?: string;
};

export const messageStatusQueue = new Queue<MessageStatusSimJob>("message-status-sim", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, removeOnComplete: 200, removeOnFail: 200 },
});

/**
 * يجدول تقدُّم حالة رسالة صادرة بواقعية (SENT فورية عند الإنشاء، ثم DELIVERED ثم READ باحتمالية،
 * على فترات متأخرة قصيرة) — يحاكي وصول webhooks تحديث حالة حقيقية من Meta متأخرة زمنياً، بدل قفز
 * كل رسالة لحالة "مقروءة" فوراً. يُستخدم فقط في وضع Sandbox (انظر lib/inbox/sandboxSimulator.ts).
 */
export async function scheduleOutboundStatusProgression(tenantId: string, waMessageId: string) {
  const failed = Math.random() < 0.05;
  if (failed) {
    await messageStatusQueue.add(
      "status", { tenantId, waMessageId, status: "failed", failureReason: "انتهت صلاحية نافذة الـ24 ساعة منذ آخر تفاعل" },
      { delay: 1200 }
    );
    return;
  }

  await messageStatusQueue.add("status", { tenantId, waMessageId, status: "delivered" }, { delay: 1500 });
  if (Math.random() < 0.7) {
    await messageStatusQueue.add("status", { tenantId, waMessageId, status: "read" }, { delay: 4000 });
  }
}
