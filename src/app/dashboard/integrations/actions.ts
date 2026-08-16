"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { IntegrationProvider } from "@prisma/client";
import { requireTenantSession } from "@/lib/session";
import { getIntegrationAdapter } from "@/lib/integrations/registry";
import { isSandboxMode } from "@/lib/integrations/types";
import { createOAuthState } from "@/lib/integrations/oauthState";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { connectMetaManually, subscribeMetaWebhook } from "@/lib/integrations/meta/connection";

/**
 * زد/سلة فقط تمرّان هنا (Meta لها معالج Embedded Signup خاص، وWhatsApp QR له لوحة مسح رمز خاصة —
 * راجع الشرط `!isMeta && !isWhatsappQr` في page.tsx الذي يُظهر هذا الزر أصلاً). في وضع Sandbox: ربط
 * فوري محاكى كما كان دائماً. في وضع Live: تحويل حقيقي فعلي لصفحة تفويض OAuth الحقيقية للمزوّد —
 * الاستكمال الفعلي يحدث لاحقاً في `/api/integrations/{provider}/callback` بعد رجوع المستخدم منها.
 */
export async function connectIntegration(provider: IntegrationProvider) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "integrations.manage");

  const adapter = getIntegrationAdapter(provider);

  if (await isSandboxMode()) {
    await adapter.handleAuthorizationCallback(session.user.tenantId, "sandbox-code");
    await writeAuditLog({
      tenantId: session.user.tenantId, userId: session.user.id,
      action: "integration.connect", targetType: "Integration", targetId: provider,
    });
    revalidatePath("/dashboard/integrations");
    return;
  }

  const state = await createOAuthState(provider, session.user.tenantId);
  redirect(adapter.getAuthorizationUrl(session.user.tenantId, state));
}

export async function disconnectIntegration(provider: IntegrationProvider) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "integrations.manage");

  const adapter = getIntegrationAdapter(provider);
  await adapter.disconnect(session.user.tenantId);

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "integration.disconnect",
    targetType: "Integration",
    targetId: provider,
  });

  revalidatePath("/dashboard/integrations");
}

export async function connectMetaManualAction(input: { wabaId: string; phoneNumberId: string; accessToken: string }): Promise<{ success: boolean; error?: string }> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "integrations.manage");

  const result = await connectMetaManually(session.user.tenantId, input);

  if (result.success) {
    await writeAuditLog({
      tenantId: session.user.tenantId, userId: session.user.id,
      action: "integration.connect_manual", targetType: "Integration", targetId: "META_WHATSAPP",
    });
    revalidatePath("/dashboard/integrations");
    return { success: true };
  }
  return { success: false, error: result.error };
}

export async function resubscribeWebhookAction(): Promise<{ success: boolean; error?: string }> {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "integrations.manage");

  try {
    await subscribeMetaWebhook(session.user.tenantId);
    revalidatePath("/dashboard/integrations");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "فشلت إعادة الاشتراك" };
  }
}

export async function resyncIntegration(provider: IntegrationProvider) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "integrations.manage");

  if (provider === IntegrationProvider.ZID || provider === IntegrationProvider.SALLA) {
    const adapter = getIntegrationAdapter(provider);
    const result = await adapter.syncOrders(session.user.tenantId);
    await withTenant(session.user.tenantId, async (tx) => {
      await tx.webhookLog.create({
        data: {
          tenantId: session.user.tenantId,
          provider,
          eventType: "manual_resync",
          payloadJson: result,
          signatureValid: true,
          processedAt: new Date(),
        },
      });
    });
  }

  revalidatePath("/dashboard/integrations");
}
