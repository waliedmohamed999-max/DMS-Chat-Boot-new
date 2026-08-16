import { PrismaClient, Prisma } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// نستخدم عميل Prisma "خام" هنا فقط لتنفيذ withTenant وsuperAdminDb.
// أي كود عمل (business logic) يجب أن يستدعي withTenant() وليس هذا العميل مباشرة،
// إلا داخل lib/tenant/scoped-*.ts نفسها.
export const rawDb: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = rawDb;
}

// صيغة معرّفات Prisma cuid الفعلية (مثال: "cmrwykgvj0000mlpmo3qpj93j") — تحقّق صارم قبل التمرير
// مباشرة إلى SET LOCAL أدناه. tenantId يأتي دائماً من session/DB وليس مدخلاً خاماً من المستخدم،
// لكن هذا تحصين دفاعي إضافي رخيص على أهم نقطة عزل واحدة في كامل المنصة: أي قيمة غير متوقعة تُرفض
// فوراً بخطأ صريح بدل الاعتماد فقط على إزالة علامة الاقتباس كـ"تعقيم".
const TENANT_ID_PATTERN = /^c[a-z0-9]{20,30}$/;

/**
 * ينفّذ دالة `fn` داخل transaction واحدة بعد ضبط `app.current_tenant_id`
 * على مستوى الجلسة، بحيث Postgres RLS يرفض أي صف لا ينتمي لهذا المستأجر
 * حتى لو نسي المطوّر إضافة شرط tenantId في where (دفاع الطبقة الرابعة).
 *
 * كل كود يقرأ/يكتب بيانات مستأجرة يجب أن يمر من هنا.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new Error(`tenantId غير صالح الصيغة: "${tenantId}" — رُفض قبل استخدامه في عزل RLS.`);
  }
  return rawDb.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    return fn(tx);
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __prismaSuperAdmin: PrismaClient | undefined;
}

/**
 * اتصال منفصل بدور قاعدة بيانات BYPASSRLS (app_superadmin) — مختلف عن الدور التشغيلي
 * العادي (app_runtime) الذي يخضع لـ RLS. له استخدامان مسموحان فقط:
 * (1) لوحة Super Admin للاستعلامات المجمّعة عبر كل المستأجرين (مثل: كل التجار، إجمالي الإيرادات).
 * (2) مهام cron/العامل الخلفية التي تحتاج تعداد tenantId عبر كل المستأجرين قبل معالجة كل واحد على
 *     حدة (مثال: `chatbot/timeoutScan.ts`, `campaigns/triggerEngine.ts`, `queue/worker.ts`,
 *     `whatsappQr/expireTrial.ts`) — بشرط صارم: أي `select`/`where` هنا يقتصر على `tenantId`/`id`
 * فقط للاكتشاف، ثم يُعاد التحويل فوراً إلى `withTenant(tenantId, ...)` للقراءة/الكتابة الفعلية على
 * أي حقل بيانات حقيقي. **لا يُستدعى أبداً** من كود يخدم طلب مستخدم تاجر واحد مباشرة — استخدم
 * withTenant() هناك دائماً.
 */
export const superAdminDb: PrismaClient =
  global.__prismaSuperAdmin ??
  new PrismaClient({
    datasources: { db: { url: process.env.SUPER_ADMIN_DATABASE_URL } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prismaSuperAdmin = superAdminDb;
}
