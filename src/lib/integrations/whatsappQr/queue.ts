import { Queue } from "bullmq";
import { redisConnection } from "@/lib/queue/connection";

export type WhatsappQrJobData = { tenantId: string };

/**
 * أوامر "ابدأ/أوقف" فقط تُرسَل عبر هذين الطابورين من Next.js (لا يوجد Worker هنا — يُعرَّف في
 * lib/queue/worker.ts نفسه اتساقاً مع بقية العمال) — الـsocket الحي والحالة اللحظية يعيشان حصراً
 * داخل عملية العامل، وتُقرأ حالتهما من Redis مباشرة (lib/integrations/whatsappQr/redisStatus.ts).
 */
export const whatsappQrStartQueue = new Queue<WhatsappQrJobData>("whatsapp-qr-start", { connection: redisConnection });
export const whatsappQrStopQueue = new Queue<WhatsappQrJobData>("whatsapp-qr-stop", { connection: redisConnection });
