import { NextRequest, NextResponse } from "next/server";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { getZidConfig } from "@/lib/integrations/zid/config";
import { zidAuthorizeUrl } from "@/lib/integrations/zid/api";
import { createZidOAuthState } from "@/lib/integrations/zid/install";

/**
 * "رابط التطبيق" (App URL) في لوحة شركاء زد: يفتحه زد عند تثبيت التاجر للتطبيق أو فتحه من لوحته. يحوّل
 * لصفحة تفويض زد (OAuth) — بعد الموافقة يعود التاجر إلى /api/zid/oauth/callback ومعه الرمز.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkIpRateLimit(ip, "zid-install", 60, 60)).allowed) return new NextResponse("Rate limit exceeded", { status: 429 });
  const config = await getZidConfig();
  if (!config.clientId || !config.clientSecret) {
    return new NextResponse("تطبيق DMS Tech على زد غير مُفعَّل بعد — تواصل مع دعم DMS Tech.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const state = await createZidOAuthState({ mode: "market" });
  return NextResponse.redirect(await zidAuthorizeUrl(state));
}
