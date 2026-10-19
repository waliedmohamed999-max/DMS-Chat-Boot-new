import { NextRequest, NextResponse } from "next/server";
import { superAdminDb } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { verifyZidAppSession } from "@/lib/integrations/zid/appSession";
import { getZidSyncState, startTrackedZidSync } from "@/lib/integrations/zid/sync";

export async function GET(req: NextRequest) {
  const session = await verifyZidAppSession(req.headers.get("authorization"));
  if (!session) return NextResponse.json({ error: "انتهت الجلسة" }, { status: 401 });
  return NextResponse.json({ sync: await getZidSyncState(session.tenantId) });
}

/** "مزامنة بياناتي الآن" من صفحة التطبيق لتاجر زد: الطلبات والمنتجات والعملاء والسلات المتروكة بالخلفية. */
export async function POST(req: NextRequest) {
  const session = await verifyZidAppSession(req.headers.get("authorization"));
  if (!session) return NextResponse.json({ error: "انتهت الجلسة" }, { status: 401 });
  if (!(await checkIpRateLimit(session.tenantId, "zid-app-sync", 6, 3600)).allowed) {
    return NextResponse.json({ error: "تمت المزامنة عدة مرات خلال الساعة الأخيرة — حاول لاحقاً" }, { status: 429 });
  }
  const started = await startTrackedZidSync(session.tenantId, "zid_app");
  if (started) {
    await superAdminDb.auditLog.create({ data: { tenantId: session.tenantId, action: "zid_app.sync", targetType: "Integration", targetId: "ZID", metaJson: { storeId: session.storeId } } });
  }
  return NextResponse.json({ started, sync: await getZidSyncState(session.tenantId) });
}
