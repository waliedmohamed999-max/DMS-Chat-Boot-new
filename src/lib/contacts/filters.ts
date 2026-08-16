import type { Prisma, ContactStage } from "@prisma/client";

/**
 * فلاتر قائمة جهات الاتصال — مصدر منطق مشترك واحد بين صفحة القائمة والتصدير، حتى لا تنحرف نتيجة
 * "تصدير القسم المعروض حالياً" عن الصفوف الفعلية المعروضة في الجدول (خلل شائع لو تكرر بناء الشرط
 * في مكانين منفصلين).
 */
export type ContactListSearchParams = {
  q?: string;
  tab?: "all" | "campaign" | "import" | "manual" | "store";
  campaignId?: string;
  stage?: ContactStage | "";
  tagId?: string;
  city?: string;
  optIn?: "yes" | "no" | "unset" | "";
  dateFrom?: string;
  dateTo?: string;
};

export function buildContactListWhere(tenantId: string, params: ContactListSearchParams): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { tenantId };

  const q = params.q?.trim();
  if (q) {
    where.OR = [{ name: { contains: q, mode: "insensitive" } }, { phoneE164: { contains: q } }];
  }

  switch (params.tab) {
    case "campaign":
      where.source = "CAMPAIGN_IMPORT";
      if (params.campaignId) where.sourceCampaignId = params.campaignId;
      break;
    case "import":
      where.source = "IMPORT";
      break;
    case "manual":
      where.source = "MANUAL";
      break;
    case "store":
      where.source = { in: ["ZID_SYNC", "SALLA_SYNC"] };
      break;
    default:
      break; // "all" أو غير محدَّد — بلا شرط مصدر
  }

  if (params.stage) where.stage = params.stage;
  if (params.tagId) where.tags = { some: { tagId: params.tagId } };
  if (params.city?.trim()) where.city = { contains: params.city.trim(), mode: "insensitive" };

  if (params.optIn === "yes") where.marketingOptIn = true;
  else if (params.optIn === "no") where.marketingOptIn = false;
  else if (params.optIn === "unset") where.marketingOptIn = null;

  if (params.dateFrom || params.dateTo) {
    where.createdAt = {
      ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
      ...(params.dateTo ? { lte: new Date(`${params.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  return where;
}
