import { NextRequest, NextResponse } from "next/server";
import { superAdminDb } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { verifyEmbeddedSession } from "@/lib/integrations/salla/embedded";
import { getSallaSyncState, startTrackedSallaSync } from "@/lib/integrations/salla/sync";

/** حالة مزامنة بيانات المتجر (جارية/آخر نتيجة) — تستعلم عنها صفحة DMS داخل لوحة سلة أثناء المزامنة. */
export async function GET(req: NextRequest) {
  const session = await verifyEmbeddedSession(req.headers.get("authorization"));
  if (!session) return NextResponse.json({ error: "انتهت الجلسة" }, { status: 401 });
  return NextResponse.json({ sync: await getSallaSyncState(session.tenantId) });
}

/** "مزامنة بياناتي الآن" من داخل لوحة سلة: تسحب الطلبات والمنتجات والعملاء بالخلفية. */
export async function POST(req: NextRequest) {
  const session = await verifyEmbeddedSession(req.headers.get("authorization"));
  if (!session) return NextResponse.json({ error: "انتهت الجلسة" }, { status: 401 });
  if (!(await checkIpRateLimit(session.tenantId, "salla-embedded-sync", 6, 3600)).allowed) {
    return NextResponse.json({ error: "تمت المزامنة عدة مرات خلال الساعة الأخيرة — حاول لاحقاً" }, { status: 429 });
  }
  const started = await startTrackedSallaSync(session.tenantId, "salla_app");
  if (started) {
    await superAdminDb.auditLog.create({
      data: { tenantId: session.tenantId, action: "salla_embedded.sync", targetType: "Integration", targetId: "SALLA", metaJson: { merchantId: session.merchantId } },
    });
  }
  return NextResponse.json({ started, sync: await getSallaSyncState(session.tenantId) });
}
