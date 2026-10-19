"use server";

import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { getZidConfig } from "@/lib/integrations/zid/config";
import { zidAuthorizeUrl } from "@/lib/integrations/zid/api";
import { createZidOAuthState } from "@/lib/integrations/zid/install";
import { getZidSyncState, startTrackedZidSync, type ZidSyncState } from "@/lib/integrations/zid/sync";

/** "ربط متجر زد" من لوحة DMS: تفويض OAuth يعود لنفس الـcallback ويُربط بهذا الحساب (state يحمل رقمه). */
export async function startZidConnect() {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "integrations.manage");
  const config = await getZidConfig();
  if (!config.clientId || !config.clientSecret) redirect("/dashboard/integrations/zid?zid_error=" + encodeURIComponent("تطبيق زد غير مُفعَّل على المنصة بعد"));
  const state = await createZidOAuthState({ mode: "dashboard", tenantId: session.user.tenantId, userId: session.user.id });
  redirect(await zidAuthorizeUrl(state));
}

export async function startZidSyncAction(): Promise<{ started: boolean; sync: ZidSyncState | null; error?: string }> {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "integrations.manage");
  const tenantId = session.user.tenantId;
  if (!(await checkIpRateLimit(tenantId, "zid-dashboard-sync", 6, 3600)).allowed) {
    return { started: false, sync: await getZidSyncState(tenantId), error: "تمت المزامنة عدة مرات خلال الساعة الأخيرة — حاول لاحقاً" };
  }
  const started = await startTrackedZidSync(tenantId, "merchant_dashboard");
  if (started) await writeAuditLog({ tenantId, userId: session.user.id, action: "integration.zid_sync", targetType: "Integration", targetId: "ZID" });
  return { started, sync: await getZidSyncState(tenantId) };
}

export async function getZidSyncStateAction(): Promise<ZidSyncState | null> {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "integrations.manage");
  return getZidSyncState(session.user.tenantId);
}
