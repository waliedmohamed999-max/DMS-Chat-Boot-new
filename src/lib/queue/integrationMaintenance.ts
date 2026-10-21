import { schedulePeriodic } from "@/lib/queue/periodic";
import { superAdminDb } from "@/lib/db";
import { getValidSallaAccessToken } from "@/lib/integrations/salla/api";
import { getValidZidBundle, zidTokensIssuedAt } from "@/lib/integrations/zid/api";
import { syncTemplatesFromChannel } from "@/lib/integrations/templateChannel";
import { sendRenewalReminders } from "@/lib/billing/subscriptionCheckout";

/**
 * صيانة يومية لرموز متاجر سلة وزد — بدونها يفقد المتجر الهادئ (بلا مزامنة/طلبات API) ربطه بصمت:
 *  - سلة: رمز الوصول ~14 يوماً وrefresh_token ~شهر ⇒ يُجدَّد كل رمز يقترب من الانتهاء.
 *  - زد: refresh_token صالح سنة من إصداره (توصية زد: تجديد مجدول ~كل 10 أشهر) ⇒ يُجدَّد بعد 300 يوم.
 * التجديد نفسه يمر بنفس الدوال المحمية بأقفال Redis (لا تجديدان متزامنان لنفس المتجر).
 */
const INTERVAL_MS = 24 * 3600 * 1000;
const ZID_RENEW_AFTER_MS = 300 * 24 * 3600 * 1000;

export async function runIntegrationTokenMaintenance(): Promise<{ salla: number; zid: number; failed: number }> {
  let salla = 0;
  let zid = 0;
  let failed = 0;

  const sallaDue = await superAdminDb.integration.findMany({
    where: { provider: "SALLA", isSandbox: false, status: "CONNECTED", encryptedRefreshToken: { not: null }, tokenExpiresAt: { lt: new Date(Date.now() + 26 * 3600 * 1000) } },
    select: { tenantId: true },
  });
  for (const { tenantId } of sallaDue) {
    try {
      await getValidSallaAccessToken(tenantId);
      salla++;
    } catch (err) {
      failed++;
      console.error(`⚠️ تعذّر تجديد رمز سلة للمستأجر ${tenantId}:`, err instanceof Error ? err.message : err);
    }
  }

  const zidAll = await superAdminDb.integration.findMany({
    where: { provider: "ZID", isSandbox: false, status: "CONNECTED", encryptedRefreshToken: { not: null } },
    select: { tenantId: true, metadataJson: true },
  });
  for (const row of zidAll) {
    const issued = zidTokensIssuedAt(row.metadataJson);
    if (issued && Date.now() - issued.getTime() < ZID_RENEW_AFTER_MS) continue;
    try {
      await getValidZidBundle(row.tenantId); // يجدّد تلقائياً عند تقادم الرموز
      zid++;
    } catch (err) {
      failed++;
      console.error(`⚠️ تعذّر تجديد رموز زد للمستأجر ${row.tenantId}:`, err instanceof Error ? err.message : err);
    }
  }
  return { salla, zid, failed };
}

schedulePeriodic(
  "integration-token-maintenance",
  INTERVAL_MS,
  async () => {
    const r = await runIntegrationTokenMaintenance();
    // نفس الدورة اليومية: تذكير التجار بتجديد الاشتراك قبل انتهائه بـ3 أيام.
    const reminders = await sendRenewalReminders().catch((err) => {
      console.error("❌ فشل إرسال تذكيرات التجديد:", err instanceof Error ? err.message : err);
      return 0;
    });
    return { ...r, reminders };
  },
  {
    onDone: (r) => {
      const x = r as { salla: number; zid: number; failed: number } | undefined;
      if (x && (x.salla || x.zid || x.failed)) console.log(`🔑 صيانة رموز المتاجر: سلة ${x.salla}، زد ${x.zid}، فشل ${x.failed}`);
    },
  }
);

/**
 * فحص دوري لحالة القوالب قيد المراجعة لدى المزوّد الحقيقي (كل 15 دقيقة) — إشعار قرار المراجعة من 360dialog/
 * Meta قد لا يصل (اسم الحدث يختلف بين التوثيقات)، فلا يبقى قالب "قيد المراجعة" للأبد ويُعطّل الحملات.
 */
const TEMPLATE_SYNC_INTERVAL_MS = 15 * 60 * 1000;

export async function runPendingTemplateSync(): Promise<{ tenants: number; updated: number; failed: number }> {
  const rows = await superAdminDb.messageTemplate.findMany({
    where: {
      status: "PENDING",
      submittedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      NOT: { externalTemplateId: { startsWith: "sandbox-" } },
    },
    select: { tenantId: true },
    distinct: ["tenantId"],
    take: 500,
  });
  let updated = 0;
  let failed = 0;
  for (const { tenantId } of rows) {
    try {
      updated += (await syncTemplatesFromChannel(tenantId)).updated;
    } catch (err) {
      failed++;
      console.error(`⚠️ تعذّرت مزامنة قوالب المستأجر ${tenantId}:`, err instanceof Error ? err.message : err);
    }
  }
  return { tenants: rows.length, updated, failed };
}

schedulePeriodic("template-status-sync", TEMPLATE_SYNC_INTERVAL_MS, () => runPendingTemplateSync(), {
  onDone: (r) => {
    const x = r as { tenants: number; updated: number; failed: number } | undefined;
    if (x && (x.updated || x.failed)) console.log(`📝 مزامنة حالة القوالب: ${x.updated} تحديث، ${x.failed} فشل (${x.tenants} تاجر)`);
  },
});

/**
 * الفوترة الإلكترونية ZATCA: معالجة المستندات المستحقة كل 5 دقائق (فواتير مدفوعة لم تُبلَّغ بعد، إعادة
 * محاولة الفاشلة شبكياً، وإشعارات الاسترداد) — الإرسال الفوري بعد الدفع يغطي الحالة العادية.
 */
schedulePeriodic("zatca-queue", 5 * 60 * 1000, async () => (await import("@/lib/zatca/service")).processZatcaQueue(), {
  onDone: (r) => {
    const x = r as { processed: number; accepted: number } | undefined;
    if (x?.processed) console.log(`🧾 ZATCA: ${x.accepted}/${x.processed} مستند مقبول`);
  },
});

/**
 * عقل البوت: تحديث صفحات الروابط في قواعد معرفة التجار أسبوعياً (يُفحص المستحق كل 6 ساعات، 30 مصدراً لكل
 * دورة). المحتوى غير المتغيّر لا يُعاد فهرسته.
 */
schedulePeriodic("brain-url-refresh", 6 * 3600 * 1000, async () => (await import("@/lib/ai/brain/ingest")).refreshStaleUrlSources(), {
  onDone: (r) => {
    const x = r as { updated: number; unchanged: number; failed: number } | undefined;
    if (x && (x.updated || x.failed)) console.log(`🧠 تحديث روابط المعرفة: ${x.updated} تغيّر، ${x.unchanged} كما هو، ${x.failed} فشل`);
  },
});
