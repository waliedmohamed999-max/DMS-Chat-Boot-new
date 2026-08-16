import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant, rawDb } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { getTenantCampaignLimits, isUnlimited } from "@/lib/campaigns/limits";
import { suggestBestSendHour } from "@/lib/campaigns/bestSendTime";
import { CampaignWizard, type CampaignWizardInitialValues } from "@/components/dashboard/CampaignWizard";
import type { SegmentFilter } from "@/lib/campaigns/audience";

export default async function NewCampaignPage({ searchParams }: { searchParams: { duplicateFrom?: string; audienceTagId?: string } }) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  if (!hasPermission(session.user.role, "campaigns.manage")) {
    redirect(`/dashboard/no-access?from=${encodeURIComponent("إنشاء حملة")}`);
  }

  const [templates, tags, limits, tenant, bestSendHour, duplicateSource] = await withTenant(tenantId, async (tx) => {
    return Promise.all([
      tx.messageTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
      tx.tag.findMany({ where: { tenantId, isSystem: false }, orderBy: { name: "asc" } }),
      getTenantCampaignLimits(tenantId),
      rawDb.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      suggestBestSendHour(tx, tenantId),
      searchParams.duplicateFrom
        ? tx.campaign.findUnique({ where: { id: searchParams.duplicateFrom, tenantId }, include: { segment: true } })
        : Promise.resolve(null),
    ]);
  });

  const remainingQuota = Math.max(0, limits.maxMessagesPerMonth - limits.messagesUsedThisPeriod);

  let initialValues: CampaignWizardInitialValues | undefined;
  if (duplicateSource) {
    initialValues = {
      name: `${duplicateSource.name} (نسخة)`,
      type: duplicateSource.type,
      audienceType: duplicateSource.audienceType,
      filter: (duplicateSource.segment?.filterJson as SegmentFilter | undefined) ?? undefined,
      templateId: duplicateSource.templateId,
      triggerEvent: duplicateSource.triggerEvent ?? undefined,
      inactiveDays: (duplicateSource.triggerConfigJson as { inactiveDays?: number } | null)?.inactiveDays,
    };
  } else if (searchParams.audienceTagId) {
    // قادم من "إضافة كجمهور مباشر لحملة جديدة" في إجراءات جهات الاتصال الجماعية — نفس آلية
    // "شريحة مخصصة" الموجودة أصلاً، بلا أي تعديل على منطق المعالج نفسه.
    initialValues = { audienceType: "SEGMENT", filter: { tagIds: [searchParams.audienceTagId] } };
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/dashboard/campaigns" className="text-sm text-accent-400 hover:underline">
        ← رجوع للحملات
      </Link>
      <div>
        <h1 className="text-xl font-bold text-white">حملة جديدة</h1>
        <p className="text-sm text-slate-400">
          باقتك الحالية: <span className="text-accent-400">{limits.planName}</span> ·{" "}
          {isUnlimited(limits.maxCampaignsPerMonth) ? "حملات غير محدودة" : `حتى ${limits.maxCampaignsPerMonth} حملة/شهر`} ·{" "}
          رصيد الرسائل المتبقي هذا الشهر: <span dir="ltr">{remainingQuota}</span>
        </p>
      </div>

      <CampaignWizard
        storeName={tenant.name}
        templates={templates}
        tags={tags}
        campaignLimits={limits}
        remainingQuota={remainingQuota}
        bestSendHour={bestSendHour}
        initialValues={initialValues}
      />
    </div>
  );
}
