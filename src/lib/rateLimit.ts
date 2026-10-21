import { redisConnection } from "@/lib/queue/connection";

/**
 * عنوان IP الحقيقي للعميل خلف وكيل الاستضافة. أول قيمة في X-Forwarded-For يكتبها العميل نفسه (قابلة
 * للتزوير — كانت تسمح بتجاوز كل حدود المعدّل بتغيير الترويسة في كل طلب)؛ الوكيل الموثوق يُلحق IP
 * المتصل الفعلي في **آخر** القائمة. TRUSTED_PROXY_HOPS = عدد الوكلاء الموثوقين أمام التطبيق (افتراضي 1).
 */
export function clientIp(headers: Headers): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (chain.length) return chain[Math.max(0, chain.length - hops)]!;
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * منطق العدّاد المشترك (INCR + EXPIRE بنافذة زمنية ثابتة) بين كل أنواع تحديد المعدَّل في هذا الملف —
 * بسيط عمداً بدل sliding-window أدق، لأن الهدف حد تقريبي يمنع الإساءة وليس دقة billing.
 */
async function incrWindow(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
  const count = await incrCounter(key, windowSeconds);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

/**
 * عدّاد احتياطي داخل الذاكرة حين يتعذّر Redis (انقطاع أو استنفاد حد الخدمة): الحماية تبقى (لكل نسخة خادم)
 * بدل أن يُسقط خطأ Redis تسجيل الدخول وكل مسار محدود المعدّل. كان خطأ Redis يظهر للمستخدم "كلمة مرور خاطئة".
 */
const g = globalThis as unknown as { __memoryRateLimit?: Map<string, { count: number; expiresAt: number }> };
const memory = (g.__memoryRateLimit ??= new Map());
let lastRedisWarning = 0;

function memoryIncr(key: string, windowSeconds: number): number {
  const now = Date.now();
  if (memory.size > 50_000) for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return 1;
  }
  entry.count++;
  return entry.count;
}

const REDIS_TIMEOUT_MS = 1500;

async function incrCounter(key: string, windowSeconds: number): Promise<number> {
  try {
    // اتصال BullMQ المشترك يعيد المحاولة بلا حد (maxRetriesPerRequest: null) — بلا مهلة كان انقطاع Redis الكامل
    // يُعلّق تسجيل الدخول بدل الرجوع للعدّاد المحلي.
    if (redisConnection.status !== "ready") throw new Error(`Redis ${redisConnection.status}`);
    const count = await Promise.race([
      redisConnection.incr(key),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Redis timeout")), REDIS_TIMEOUT_MS).unref?.()),
    ]);
    if (count === 1) await redisConnection.expire(key, windowSeconds).catch(() => {});
    return count;
  } catch (err) {
    if (Date.now() - lastRedisWarning > 60_000) {
      lastRedisWarning = Date.now();
      console.error("⚠️ Redis غير متاح لتحديد المعدّل — عدّاد داخل الذاكرة مؤقتاً:", err instanceof Error ? err.message : err);
    }
    return memoryIncr(key, windowSeconds);
  }
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
  const count = await incrCounter(key, LOGIN_ATTEMPT_WINDOW_SECONDS);
  return { allowed: count <= LOGIN_ATTEMPT_LIMIT, remaining: Math.max(0, LOGIN_ATTEMPT_LIMIT - count) };
}

/** يُستدعى فقط بعد نجاح الدخول الفعلي — يصفّر عدّاد المحاولات الفاشلة لهذا البريد. */
export async function resetLoginRateLimit(email: string): Promise<void> {
  const key = `ratelimit:login-attempt:${email.toLowerCase().trim()}`;
  memory.delete(key);
  if (redisConnection.status === "ready") void redisConnection.del(key).catch(() => {});
}
