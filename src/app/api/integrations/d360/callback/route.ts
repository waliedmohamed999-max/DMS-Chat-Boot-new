import { NextRequest, NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { consumeOAuthState } from "@/lib/integrations/oauthState";
import { connectD360Channel } from "@/lib/integrations/d360/adapter";
import { writeAuditLog } from "@/lib/audit";

/** معرّفات القنوات تصل كـ channels=[id1,id2] أو channels=id1,id2 أو channel_id=id حسب إعداد صفحة 360dialog. */
function parseChannelIds(req: NextRequest): string[] {
  const p = req.nextUrl.searchParams;
  const raw = p.get("channels") ?? p.get("channel_ids") ?? p.get("channel_id") ?? "";
  return raw.replace(/[\[\]"\s]/g, "").split(",").filter(Boolean);
}

/**
 * عودة التاجر من "Integrated Onboarding" في 360dialog بعد ربط رقمه. التاجر مسجّل دخوله في نفس المتصفح،
 * فالحساب يُحدَّد من الجلسة (وحالة OAuth إن أعادتها 360dialog). القناة تُربط بحساب واحد فقط.
 */
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const fail = (reason: string) => NextResponse.redirect(`${baseUrl}/dashboard/integrations?d360_error=${encodeURIComponent(reason)}`);

  const session = await requireTenantSession();
  try {
    requireEffectivePermission(session.user.permissions, "integrations.manage");
  } catch {
    return fail("لا تملك صلاحية إدارة التكاملات");
  }
  const tenantId = session.user.tenantId;

  const state = req.nextUrl.searchParams.get("state");
  if (state) {
    const stateTenant = await consumeOAuthState("D360DIALOG", state);
    if (stateTenant !== tenantId) return fail("انتهت صلاحية طلب الربط — أعد المحاولة");
  }

  const [channelId] = parseChannelIds(req);
  if (!channelId) return fail("لم يُرجع 360dialog أي رقم مربوط");

  const takenBy = await superAdminDb.integration.findFirst({ where: { channelId }, select: { tenantId: true } });
  if (takenBy && takenBy.tenantId !== tenantId) return fail("هذا الرقم مربوط بحساب آخر");

  try {
    const channel = await connectD360Channel(tenantId, channelId);
    await writeAuditLog({
      tenantId, userId: session.user.id, action: "integration.connect_d360", targetType: "Integration", targetId: "D360DIALOG",
      metaJson: { channelId, phoneNumber: channel.phoneNumber, client: req.nextUrl.searchParams.get("client") },
    });
    return NextResponse.redirect(`${baseUrl}/dashboard/integrations?connected=D360DIALOG`);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "فشل ربط الرقم");
  }
}
