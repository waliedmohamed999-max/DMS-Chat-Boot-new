import { NextRequest, NextResponse } from "next/server";
import { superAdminDb } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { consumeOAuthState } from "@/lib/integrations/oauthState";
import { appBaseUrl } from "@/lib/integrations/zid/api";
import { consumeZidOAuthState, handleZidOAuthCallback, type ZidOAuthState } from "@/lib/integrations/zid/install";
import { issueZidAppSession } from "@/lib/integrations/zid/appSession";

/**
 * Redirect URL الوحيد المسجَّل في لوحة شركاء زد — لمسارين:
 *  - market: التاجر ثبّت/فتح التطبيق من زد ⇒ صفحة التطبيق /zid/app بجلسة (في جزء # من الرابط لا يصل للخوادم).
 *  - dashboard: "ربط زد" من لوحة DMS ⇒ صفحة ربط زد في لوحة التاجر.
 * state لمرة واحدة (Redis) يحدد المسار ويمنع CSRF؛ الرمز يُستبدل فوراً (صالح 10 دقائق ولمرة واحدة).
 */
export async function GET(req: NextRequest) {
  const base = appBaseUrl();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkIpRateLimit(ip, "zid-oauth-callback", 60, 60)).allowed) return new NextResponse("Rate limit exceeded", { status: 429 });

  const code = req.nextUrl.searchParams.get("code");
  const rawState = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error") ?? req.nextUrl.searchParams.get("error_code");

  let state: ZidOAuthState | null = await consumeZidOAuthState(rawState);
  if (!state && rawState) {
    // توافق: حالة أنشأها مسار "ربط الآن" العام في صفحة التكاملات (lib/integrations/oauthState.ts).
    const tenantId = await consumeOAuthState("ZID", rawState);
    if (tenantId) state = { mode: "dashboard", tenantId, userId: "" };
  }
  const fail = (reason: string) =>
    NextResponse.redirect(
      state?.mode === "dashboard"
        ? `${base}/dashboard/integrations/zid?zid_error=${encodeURIComponent(reason)}`
        : `${base}/zid/app?error=${encodeURIComponent(reason)}`
    );

  if (oauthError) return fail(`رفض التفويض من زد (${oauthError})`);
  if (!state) return fail("انتهت صلاحية طلب الربط — أعد فتح التطبيق من لوحة زد");
  if (!code) return fail("لم يُرسل زد رمز التفويض");

  try {
    const result = await handleZidOAuthCallback(code, state);
    if (result.outcome === "conflict") {
      await superAdminDb.webhookLog.create({ data: { provider: "ZID", eventType: "oauth_conflict", payloadJson: { mode: state.mode }, signatureValid: true, errorMessage: result.reason } });
      return fail(result.reason);
    }
    if (state.mode === "dashboard") return NextResponse.redirect(`${base}/dashboard/integrations/zid?connected=1`);
    const session = await issueZidAppSession(result.storeId, result.tenantId);
    return NextResponse.redirect(`${base}/zid/app?welcome=${result.outcome}#s=${session}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل غير معروف";
    console.error("❌ فشل ربط زد:", message);
    return fail(message);
  }
}
