import { NextRequest, NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { consumeOAuthState } from "@/lib/integrations/oauthState";
import { sallaAdapter } from "@/lib/integrations/salla/adapter";
import { writeAuditLog } from "@/lib/audit";

/**
 * Callback حقيقي لتفويض OAuth مع سلة (وضع live فقط). يجب أن يطابق حرفياً رابط الـRedirect URI
 * المسجَّل في لوحة تطبيقات سلة الشريك (salla.partners).
 */
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?salla_error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?salla_error=missing_code_or_state`);
  }

  const session = await requireTenantSession();
  try {
    requireEffectivePermission(session.user.permissions, "integrations.manage");
  } catch {
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?salla_error=no_permission`);
  }

  const stateTenantId = await consumeOAuthState("SALLA", state);
  if (!stateTenantId || stateTenantId !== session.user.tenantId) {
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?salla_error=invalid_state`);
  }

  try {
    await sallaAdapter.handleAuthorizationCallback(session.user.tenantId, code);
    await writeAuditLog({
      tenantId: session.user.tenantId, userId: session.user.id,
      action: "integration.connect_live", targetType: "Integration", targetId: "SALLA",
    });
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?connected=SALLA`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل غير معروف";
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?salla_error=${encodeURIComponent(message)}`);
  }
}
