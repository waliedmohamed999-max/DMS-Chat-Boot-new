import { redisConnection } from "@/lib/queue/connection";

/**
 * منطق العدّاد المشترك (INCR + EXPIRE بنافذة زمنية ثابتة) بين كل أنواع تحديد المعدَّل في هذا الملف —
 * بسيط عمداً بدل sliding-window أدق، لأن الهدف حد تقريبي يمنع الإساءة وليس دقة billing.
 */
async function incrWindow(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
  const count = await redisConnection.incr(key);
  if (count === 1) {
    await redisConnection.expire(key, windowSeconds);
  }
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

/**
 * حد إرسال بسيط بنافذة زمنية ثابتة لكل مستأجر — بحيث تاجر واحد لا يقدر يستهلك كل قدرة الإرسال أو
 * يُغرق webhooks على حساب بقية المستأجرين (متطلب أمان أساسي في منصة multi-tenant). يُستخدم في:
 *  - عامل إرسال الحملات (src/lib/queue/worker.ts) قبل كل رسالة.
 *  - نقاط استقبال الـ webhooks بعد تحديد tenantId (src/app/api/webhooks/*).
 */
export async function checkTenantRateLimit(
  tenantId: string,
  action: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  return incrWindow(`ratelimit:${action}:${tenantId}`, limit, windowSeconds);
}

/**
 * حد بعنوان IP بلا أي معرفة مسبقة بالمستأجر — يُستخدم في مسارات webhook العامة (Meta/سلة/زد/الدفع)
 * **قبل** التحقق من التوقيع وقبل أي كتابة قاعدة بيانات، لأن أي طرف مجهول يقدر يستدعي هذه المسارات
 * مباشرة (عامة بالضرورة). بدون هذا الحد، توقيع خاطئ متكرر أو تاجر غير مطابق يُنتج كتابة WebhookLog
 * حقيقية بلا أي سقف — استنزاف قاعدة بيانات/تخزين رخيص لمهاجم مجهول. حد عام (بلا tenantId) عمداً.
 */
export async function checkIpRateLimit(ip: string, action: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
  return incrWindow(`ratelimit:${action}:ip:${ip}`, limit, windowSeconds);
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
