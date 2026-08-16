import type { Prisma, TenantStatus } from "@prisma/client";
import { superAdminDb } from "@/lib/db";
import { CORE_PROVIDERS } from "@/lib/integrationHealth";

/** فلاتر جدول التجار — مصدر منطق مشترك بين صفحة القائمة والتصدير، بنفس مبدأ
 * lib/contacts/filters.ts (تجنّب انحراف نتيجة "تصدير القائمة المعروضة حالياً" عن الجدول الفعلي). */
export type TenantListSearchParams = {
  q?: string;
  status?: TenantStatus | "";
  planId?: string;
  health?: "full" | "partial" | "none" | "";
};

export async function buildTenantListWhere(params: TenantListSearchParams): Promise<Prisma.TenantWhereInput> {
  const where: Prisma.TenantWhereInput = {};

  if (params.status) where.status = params.status;
  if (params.planId) where.subscription = { planId: params.planId };

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { users: { some: { role: "OWNER", email: { contains: q, mode: "insensitive" } } } },
      // رقم واتساب المربوط فعلياً (وليس هاتف صاحب الحساب — غير مُخزَّن كحقل مستقل في هذا المشروع) —
      // بحث ضمن metadataJson لكل من Meta Cloud API والقناة التجريبية QR.
      { integrations: { some: { metadataJson: { path: ["displayPhoneNumber"], string_contains: q } } } },
      { integrations: { some: { metadataJson: { path: ["connectedPhoneE164"], string_contains: q } } } },
    ];
  }

  if (params.health) {
    // فلتر الاكتمال يحتاج معرفة أي التينانتات لديها N من CORE_PROVIDERS متصلة فعلياً — يُحسَب هنا
    // عبر استعلام تجميعي منفصل بدل تحميل كل التكاملات في الذاكرة لكل تينانت.
    const grouped = await superAdminDb.integration.groupBy({
      by: ["tenantId"],
      where: { provider: { in: CORE_PROVIDERS }, status: "CONNECTED" },
      _count: true,
    });
    const idsByCount = new Map<string, number>(grouped.map((g) => [g.tenantId, g._count]));
    const allTenantIds = await superAdminDb.tenant.findMany({ select: { id: true } });
    const matchingIds = allTenantIds
      .filter(({ id }) => {
        const count = idsByCount.get(id) ?? 0;
        if (params.health === "full") return count >= CORE_PROVIDERS.length;
        if (params.health === "partial") return count > 0 && count < CORE_PROVIDERS.length;
        return count === 0;
      })
      .map((t) => t.id);
    where.id = { in: matchingIds };
  }

  return where;
}
