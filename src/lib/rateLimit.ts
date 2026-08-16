import { redisConnection } from "@/lib/queue/connection";

/**
 * حد إرسال بسيط بنافذة زمنية ثابتة (fixed window) لكل مستأجر، مخزَّن في Redis نفسه المستخدم
 * للقوائم — بحيث تاجر واحد لا يقدر يستهلك كل قدرة الإرسال أو يُغرق webhooks على حساب بقية
 * المستأجرين (متطلب أمان أساسي في منصة multi-tenant). يُستخدم في:
 *  - عامل إرسال الحملات (src/lib/queue/worker.ts) قبل كل رسالة.
 *  - نقاط استقبال الـ webhooks بعد تحديد tenantId (src/app/api/webhooks/*).
 *
 * التنفيذ بسيط عمداً (INCR + EXPIRE) بدل خوارزمية sliding-window أدق، لأن الهدف هو منع
 * "تأثير تاجر على غيره" وليس دقة billing — يكفي حد تقريبي بنافذة ثابتة لهذا الغرض.
 */
export async function checkTenantRateLimit(
  tenantId: string,
  action: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `ratelimit:${action}:${tenantId}`;
  const count = await redisConnection.incr(key);
  if (count === 1) {
    await redisConnection.expire(key, windowSeconds);
  }
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

// حد محاولات تسجيل الدخول: 8 محاولات فاشلة كل 10 دقائق لكل بريد إلكتروني — يمنع تخمين كلمات
// المرور آلياً (Brute Force) على أي حساب بعينه. تحقُّق حقيقي اكتُشف غيابه تماماً أثناء مراجعة أمنية
// شاملة قبل ربط بيانات إنتاجية حقيقية — لم يكن هناك أي حد سابق على محاولات الدخول إطلاقاً.
const LOGIN_ATTEMPT_LIMIT = 8;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 600;

export async function checkLoginRateLimit(email: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `ratelimit:login-attempt:${email.toLowerCase().trim()}`;
  const count = await redisConnection.incr(key);
  if (count === 1) {
    await redisConnection.expire(key, LOGIN_ATTEMPT_WINDOW_SECONDS);
  }
  return { allowed: count <= LOGIN_ATTEMPT_LIMIT, remaining: Math.max(0, LOGIN_ATTEMPT_LIMIT - count) };
}

/** يُستدعى فقط بعد نجاح الدخول الفعلي — يصفّر عدّاد المحاولات الفاشلة لهذا البريد. */
export async function resetLoginRateLimit(email: string): Promise<void> {
  await redisConnection.del(`ratelimit:login-attempt:${email.toLowerCase().trim()}`);
}
