"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";

export async function dismissAnnouncement(announcementId: string) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    await tx.announcementDismissal.upsert({
      where: { announcementId_tenantId: { announcementId, tenantId } },
      update: {},
      create: { announcementId, tenantId },
    });
  });

  revalidatePath("/dashboard");
}

/** يُستدعى مرة واحدة عند ظهور البانر فعلياً في متصفح التاجر (وليس عند الإغلاق) — upsert لأن نفس
 * التاجر ممكن يزور الداشبورد أكتر من مرة قبل ما يقفل الإعلان. */
export async function recordAnnouncementView(announcementId: string) {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.announcementView.upsert({
      where: { announcementId_tenantId: { announcementId, tenantId } },
      update: {},
      create: { announcementId, tenantId },
    });
  });
  // بلا revalidatePath — تسجيل خلفي بحت، لا يغيّر أي شيء في واجهة التاجر نفسه.
}
