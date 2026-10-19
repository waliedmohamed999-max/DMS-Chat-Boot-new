import { NextRequest, NextResponse } from "next/server";
import { superAdminDb } from "@/lib/db";
import { verifyEmbeddedSession } from "@/lib/integrations/salla/embedded";
import { setAutomationEnabled, type SallaAutomationKey } from "@/lib/integrations/salla/automations";

const KEYS: SallaAutomationKey[] = ["abandonedCart", "welcome"];

/** تشغيل/إيقاف رسالة تلقائية من صفحة DMS داخل لوحة سلة (من فتح التطبيق = مستخدم لوحة متجر سلة المصادَق). */
export async function POST(req: NextRequest) {
  const session = await verifyEmbeddedSession(req.headers.get("authorization"));
  if (!session) return NextResponse.json({ error: "انتهت الجلسة" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const key = body?.key as SallaAutomationKey;
  if (!KEYS.includes(key) || typeof body?.enabled !== "boolean") return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });

  const state = await setAutomationEnabled(session.tenantId, key, body.enabled);
  await superAdminDb.auditLog.create({
    data: {
      tenantId: session.tenantId, action: "salla_embedded.automation_toggle", targetType: "Automation", targetId: key,
      metaJson: { enabled: body.enabled, merchantId: session.merchantId },
    },
  });
  return NextResponse.json({ automation: state });
}
