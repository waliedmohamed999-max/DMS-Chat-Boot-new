import { NextRequest, NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { consumeOAuthState } from "@/lib/integrations/oauthState";
import { zidAdapter } from "@/lib/integrations/zid/adapter";
import { writeAuditLog } from "@/lib/audit";

/**
 * Callback حقيقي لتفويض OAuth مع زد (وضع live فقط — وضع sandbox لا يمر عبر هذا المسار إطلاقاً).
 * يجب أن يطابق حرفياً رابط الـRedirect URI المسجَّل في لوحة تطبيقات زد الشريك (partner.zid.sa).
 */
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?zid_error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?zid_error=missing_code_or_state`);
  }

  const session = await requireTenantSession();
  try {
    requirePermission(session.user.role, "integrations.manage");
  } catch {
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?zid_error=no_permission`);
  }

  const stateTenantId = await consumeOAuthState("ZID", state);
  if (!stateTenantId || stateTenantId !== session.user.tenantId) {
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?zid_error=invalid_state`);
  }

  try {
    await zidAdapter.handleAuthorizationCallback(session.user.tenantId, code);
    await writeAuditLog({
      tenantId: session.user.tenantId, userId: session.user.id,
      action: "integration.connect_live", targetType: "Integration", targetId: "ZID",
    });
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?connected=ZID`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل غير معروف";
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?zid_error=${encodeURIComponent(message)}`);
  }
}
