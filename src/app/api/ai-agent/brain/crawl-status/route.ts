import { NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { getSiteCrawlState } from "@/lib/ai/brain/crawl";

/** حالة سحب الموقع للتاجر الحالي فقط — استطلاع خفيف أثناء السحب بدل إعادة تحميل صفحة عقل البوت كاملة. */
export async function GET() {
  const session = await requireTenantSession();
  if (!hasEffectivePermission(session.user.permissions, "chatbot.edit")) return NextResponse.json(null, { status: 403 });
  return NextResponse.json(await getSiteCrawlState(session.user.tenantId), { headers: { "Cache-Control": "no-store" } });
}
