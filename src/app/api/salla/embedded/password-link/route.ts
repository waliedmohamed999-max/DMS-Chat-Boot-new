import { NextRequest, NextResponse } from "next/server";
import { superAdminDb } from "@/lib/db";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { verifyEmbeddedSession } from "@/lib/integrations/salla/embedded";
import { sendPasswordResetLink } from "@/lib/auth/passwordReset";

/** إرسال رابط تحديد كلمة المرور لمالك الحساب — يُرسل لبريد المالك المسجَّل فقط (لا يُعرض الرابط في الصفحة). */
export async function POST(req: NextRequest) {
  const session = await verifyEmbeddedSession(req.headers.get("authorization"));
  if (!session) return NextResponse.json({ error: "انتهت الجلسة" }, { status: 401 });
  if (!(await checkTenantRateLimit(session.tenantId, "salla-embedded-password-link", 3, 3600)).allowed) {
    return NextResponse.json({ error: "أُرسل الرابط مؤخراً — تفقّد بريدك أو حاول بعد ساعة." }, { status: 429 });
  }
  const owner = await superAdminDb.user.findFirst({ where: { tenantId: session.tenantId, role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" } });
  if (!owner) return NextResponse.json({ error: "لا يوجد مالك نشط للحساب" }, { status: 404 });
  try {
    await sendPasswordResetLink(owner, { source: "salla_embedded", merchantId: session.merchantId });
  } catch (err) {
    console.error("salla embedded password link failed:", err);
    return NextResponse.json({ error: "تعذّر إرسال البريد حالياً" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, email: owner.email });
}
