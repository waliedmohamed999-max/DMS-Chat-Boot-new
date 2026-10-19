import { NextRequest, NextResponse } from "next/server";
import { superAdminDb } from "@/lib/db";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { verifyZidAppSession } from "@/lib/integrations/zid/appSession";
import { sendPasswordResetLink } from "@/lib/auth/passwordReset";

/** رابط تحديد كلمة المرور لمالك الحساب — لبريده المسجَّل فقط (لا يُعرض الرابط في الصفحة). */
export async function POST(req: NextRequest) {
  const session = await verifyZidAppSession(req.headers.get("authorization"));
  if (!session) return NextResponse.json({ error: "انتهت الجلسة" }, { status: 401 });
  if (!(await checkTenantRateLimit(session.tenantId, "zid-app-password-link", 3, 3600)).allowed) {
    return NextResponse.json({ error: "أُرسل الرابط مؤخراً — تفقّد بريدك أو حاول بعد ساعة." }, { status: 429 });
  }
  const owner = await superAdminDb.user.findFirst({ where: { tenantId: session.tenantId, role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" } });
  if (!owner) return NextResponse.json({ error: "لا يوجد مالك نشط للحساب" }, { status: 404 });
  try {
    await sendPasswordResetLink(owner, { source: "zid_app", merchantId: session.storeId });
  } catch (err) {
    console.error("zid app password link failed:", err);
    return NextResponse.json({ error: "تعذّر إرسال البريد حالياً" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, email: owner.email });
}
