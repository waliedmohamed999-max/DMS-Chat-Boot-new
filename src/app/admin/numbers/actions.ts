"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { getIntegrationAdapter } from "@/lib/integrations/registry";
import { getD360Channel } from "@/lib/integrations/d360/client";

async function guard() {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.manage_tenants");
  return session;
}

/** يجلب حالة القناة الفعلية من 360dialog (جاهزة/قيد الإعداد/خطأ) ويحدّثها — مفيد عند تأخر webhook الشريك. */
export async function refreshD360Channel(integrationId: string) {
  const session = await guard();
  const integration = await superAdminDb.integration.findUniqueOrThrow({ where: { id: integrationId } });
  if (integration.provider !== "D360DIALOG" || !integration.channelId) throw new Error("ليست قناة 360dialog");
  const channel = await getD360Channel(integration.channelId);
  const meta = (integration.metadataJson && typeof integration.metadataJson === "object" ? integration.metadataJson : {}) as Record<string, unknown>;
  await superAdminDb.integration.update({
    where: { id: integrationId },
    data: {
      pendingVerification: channel.availability !== "ready",
      metadataJson: { ...meta, availability: channel.availability, channelStatus: channel.status, displayPhoneNumber: channel.phoneNumber ?? meta.displayPhoneNumber, refreshedAt: new Date().toISOString() } as Prisma.InputJsonValue,
    },
  });
  await superAdminDb.auditLog.create({
    data: { tenantId: integration.tenantId, userId: session.user.id, action: "platform.number_refresh", targetType: "Integration", targetId: integrationId, metaJson: { availability: channel.availability } },
  });
  revalidatePath("/admin/numbers");
}

export async function disconnectNumber(integrationId: string) {
  const session = await guard();
  const integration = await superAdminDb.integration.findUniqueOrThrow({ where: { id: integrationId } });
  await getIntegrationAdapter(integration.provider).disconnect(integration.tenantId);
  await superAdminDb.auditLog.create({
    data: { tenantId: integration.tenantId, userId: session.user.id, action: "platform.number_disconnect", targetType: "Integration", targetId: integrationId, metaJson: { provider: integration.provider } },
  });
  revalidatePath("/admin/numbers");
}
