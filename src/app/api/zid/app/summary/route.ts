import { NextRequest, NextResponse } from "next/server";
import { buildZidAppSummary, verifyZidAppSession } from "@/lib/integrations/zid/appSession";

export async function GET(req: NextRequest) {
  const session = await verifyZidAppSession(req.headers.get("authorization"));
  if (!session) return NextResponse.json({ error: "انتهت الجلسة — أعد فتح التطبيق من لوحة زد" }, { status: 401 });
  return NextResponse.json({ summary: await buildZidAppSummary(session.tenantId) });
}
