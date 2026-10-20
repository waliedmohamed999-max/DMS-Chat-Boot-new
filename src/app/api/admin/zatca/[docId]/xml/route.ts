import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";

/** تنزيل XML المستند الموقّع/المعتمد من الهيئة (للأرشفة والتدقيق) — لفريق المنصة بصلاحية الإعدادات أو الفوترة. */
export async function GET(_req: NextRequest, props: { params: Promise<{ docId: string }> }) {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.settings.manage") && !hasEffectivePermission(session.user.permissions, "platform.view_revenue")) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const { docId } = await props.params;
  const doc = await superAdminDb.zatcaDocument.findUnique({ where: { id: docId }, select: { xml: true, uuid: true } });
  if (!doc?.xml) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(doc.xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="zatca-${doc.uuid}.xml"`, "X-Content-Type-Options": "nosniff" },
  });
}
