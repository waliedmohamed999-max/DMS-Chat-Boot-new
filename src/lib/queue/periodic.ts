import { redisConnection } from "@/lib/queue/connection";

/**
 * مُجدوِل المهام الدورية داخل العملية (بديل مهام BullMQ المتكررة). كل عامل BullMQ خامل يستطلع Redis باستمرار
 * (حتى 10 ثوانٍ مع وجود مهام متكررة مؤجلة + فحص المهام العالقة كل 30 ثانية) — عشرة عمّال للفحوص الدورية
 * كانوا يستهلكون ~115 ألف طلب Redis يومياً واستنفدوا حد Upstash الشهري (500 ألف) فتعطّل تسجيل الدخول.
 * هنا: مؤقت محلي + طلب Redis واحد لكل تشغيل (قفل SET NX) يضمن تشغيلاً واحداً لكل دورة عبر كل النسخ.
 */

type Registry = Map<string, { running: boolean }>;
const g = globalThis as unknown as { __periodicTasks?: Registry };
const registry: Registry = (g.__periodicTasks ??= new Map());

export function schedulePeriodic(
  name: string,
  everyMs: number,
  run: () => Promise<unknown>,
  opts: { initialDelayMs?: number; onDone?: (result: unknown) => void } = {}
) {
  if (registry.has(name)) return; // استيراد مزدوج للوحدة (طبقات Next) لا يكرّر المؤقت
  const state = { running: false };
  registry.set(name, state);

  const tick = async () => {
    if (state.running) return; // تشغيل سابق أطول من الدورة — لا تداخل
    let acquired = true;
    try {
      acquired = (await redisConnection.set(`periodic-lock:${name}`, String(process.pid), "PX", Math.max(1000, everyMs - 5000), "NX")) === "OK";
    } catch {
      // Redis غير متاح (حد الخدمة/انقطاع): نسخة واحدة هي الحالة المعتادة — التشغيل أولى من إيقاف الصيانة الدورية.
      acquired = true;
    }
    if (!acquired) return;
    state.running = true;
    try {
      opts.onDone?.(await run());
    } catch (err) {
      console.error(`❌ مهمة دورية ${name}:`, err instanceof Error ? err.message : err);
    } finally {
      state.running = false;
    }
  };

  // تأخير أول مع تفاوت عشوائي — لا تبدأ كل المهام لحظة الإقلاع معاً.
  const first = setTimeout(() => {
    void tick();
    const interval = setInterval(() => void tick(), everyMs);
    interval.unref?.();
  }, (opts.initialDelayMs ?? 30_000) + Math.floor(Math.random() * 15_000));
  first.unref?.();
}

/**
 * إعدادات عمّال الطوابير الحقيقية (إرسال الحملات...): انتظار طويل حين يكون الطابور فارغاً (إضافة مهمة توقظ العامل
 * فوراً) وفحص المهام العالقة كل 5 دقائق بدل 30 ثانية — طلبات Redis خاملة شبه معدومة.
 */
export const IDLE_FRIENDLY_WORKER_OPTS = { drainDelay: 300, stalledInterval: 5 * 60 * 1000 } as const;
