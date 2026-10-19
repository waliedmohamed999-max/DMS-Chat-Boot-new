"use server";

import { revalidatePath } from "next/cache";
import { IntegrationProvider, Prisma } from "@prisma/client";
import { requireTenantSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const CATEGORIES = ["UTILITY", "AUTHENTICATION", "MARKETING"] as const;

/** قوالب رسائل متجر سلة على القناة الرسمية (خارج نافذة الـ24 ساعة) — قالب معتمد لكل فئة، متغيره الأول = نص سلة. */
export async function saveSallaCommTemplates(_prev: { ok: boolean; message: string } | null, formData: FormData) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "integrations.manage");
  const tenantId = session.user.tenantId;

  const chosen: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const id = String(formData.get(c) ?? "");
    if (id) chosen[c] = id;
  }

  const result = await withTenant(tenantId, async (tx) => {
    // كل قالب مختار يجب أن يكون معتمداً، تابعاً لهذا التاجر، ومن نفس الفئة، وفيه متغير {{1}} لنص سلة.
    for (const [category, id] of Object.entries(chosen)) {
      const t = await tx.messageTemplate.findUnique({ where: { id, tenantId } });
      if (!t || t.status !== "APPROVED") return { ok: false, message: "قالب غير معتمد أو غير موجود" };
      if (t.category.toUpperCase() !== category) return { ok: false, message: `القالب "${t.name}" ليس من فئة ${category}` };
      if (!t.bodyText.includes("{{1}}")) return { ok: false, message: `القالب "${t.name}" يجب أن يحتوي المتغير {{1}} ليوضع فيه نص الرسالة` };
    }
    const integration = await tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.SALLA } } });
    if (!integration) return { ok: false, message: "لا يوجد ربط سلة" };
    const meta = (integration.metadataJson && typeof integration.metadataJson === "object" ? integration.metadataJson : {}) as Record<string, unknown>;
    await tx.integration.update({ where: { id: integration.id }, data: { metadataJson: { ...meta, commTemplates: chosen } as Prisma.InputJsonValue } });
    return { ok: true, message: "تم حفظ قوالب رسائل المتجر" };
  });

  if (result.ok) {
    await writeAuditLog({ tenantId, userId: session.user.id, action: "integration.salla_comm_templates", targetType: "Integration", targetId: "SALLA", metaJson: chosen });
    revalidatePath("/dashboard/integrations/salla");
  }
  return result;
}
