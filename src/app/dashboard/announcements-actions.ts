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
