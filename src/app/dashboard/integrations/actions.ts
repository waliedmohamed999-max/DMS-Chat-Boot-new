"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { IntegrationProvider } from "@prisma/client";
import { requireTenantSession } from "@/lib/session";
import { getIntegrationAdapter } from "@/lib/integrations/registry";
import { isSandboxMode } from "@/lib/integrations/types";
import { createOAuthState } from "@/lib/integrations/oauthState";
import { withTenant } from "@/lib/db";
import { requireEffectivePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { connectMetaManually, subscribeMetaWebhook } from "@/lib/integrations/meta/connection";
import { sallaInstallUrl } from "@/lib/integrations/salla/api";

/** Connect supported official integrations through their authorization flow. */
export async function connectIntegration(provider: IntegrationProvider) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "integrations.manage");

  const adapter = getIntegrationAdapter(provider);

  // سلة بالنمط السهل: الربط = تثبيت التطبيق من متجر سلة، والرموز تصل لاحقاً عبر الـwebhook — لا علاقة
  // له بوضع Sandbox العام للمنصة (التطبيق حقيقي متى ضُبط رقمه).
  const sallaUrl = provider === "SALLA" ? await sallaInstallUrl() : null;
  if (sallaUrl) redirect(sallaUrl);

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
  requireEffectivePermission(session.user.permissions, "integrations.manage");

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
  if (provider === IntegrationProvider.SALLA) revalidatePath("/dashboard/integrations/salla");
}

export async function connectMetaManualAction(input: { wabaId: string; phoneNumberId: string; accessToken: string }): Promise<{ success: boolean; error?: string }> {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "integrations.manage");

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
  requireEffectivePermission(session.user.permissions, "integrations.manage");

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
  requireEffectivePermission(session.user.permissions, "integrations.manage");

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
  if (provider === IntegrationProvider.SALLA) revalidatePath("/dashboard/integrations/salla");
}
