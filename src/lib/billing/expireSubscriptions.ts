import { superAdminDb, withTenant } from "@/lib/db";

/**
 * فحص دوري عبر كل المستأجرين (نفس نمط scanAndExpireQrTrials/scanAllTenantsTriggeredCampaigns) —
 * أي اشتراك (تجريبي أو نشط) تجاوزت فترته الحالية (currentPeriodEnd) دون تجديد يُنقَل لحالة
 * PAST_DUE. هذا كان مفقوداً تماماً قبل هذه الجولة: currentPeriodEnd كان يُكتب مرة واحدة عند
 * الإنشاء ثم لا يُقرأ إلا للعرض — لا شيء كان يحوّل الحالة عند انتهائه فعلياً.
 *
 * لا يُعلَّق حساب التاجر بالكامل هنا (Tenant.status منفصل تماماً، ويُستخدم لتعليق إداري من فريق
 * المنصة، وليس لدورة حياة الفوترة) — فقط Subscription.status يتحول لـPAST_DUE، وإنفاذه الفعلي
 * (منع إنشاء حملات جديدة) في createCampaign عبر getTenantCampaignLimits().subscriptionStatus.
 * يبقى بإمكان التاجر تسجيل الدخول وإدارة الفوترة لترقية باقته يدوياً.
 */
export async function scanAndExpireSubscriptions(): Promise<void> {
  const expired = await superAdminDb.subscription.findMany({
    where: { status: { in: ["TRIALING", "ACTIVE"] }, currentPeriodEnd: { lt: new Date() } },
    select: { tenantId: true },
  });

  for (const { tenantId } of expired) {
    try {
      await withTenant(tenantId, (tx) =>
        tx.subscription.update({ where: { tenantId }, data: { status: "PAST_DUE" } })
      );
    } catch (err) {
      console.error(`❌ فشل تحويل اشتراك المستأجر ${tenantId} لحالة PAST_DUE:`, err);
    }
  }

  // استئناف تلقائي للاشتراكات المُوقَفة مؤقتاً (PAUSED، من تدفق الاحتفاظ بالعميل عند الإلغاء) بعد
  // انتهاء pausedUntil — نفس الدورة الفعلية، بلا مهمة BullMQ منفصلة.
  const pausedExpired = await superAdminDb.subscription.findMany({
    where: { status: "PAUSED", pausedUntil: { lt: new Date() } },
    select: { tenantId: true },
  });

  for (const { tenantId } of pausedExpired) {
    try {
      await withTenant(tenantId, (tx) =>
        tx.subscription.update({ where: { tenantId }, data: { status: "ACTIVE", pausedUntil: null } })
      );
    } catch (err) {
      console.error(`❌ فشل استئناف اشتراك المستأجر ${tenantId} بعد انتهاء الإيقاف المؤقت:`, err);
    }
  }
}
