import { NextRequest, NextResponse } from "next/server";
import { buildEmbeddedSummary, verifyEmbeddedSession } from "@/lib/integrations/salla/embedded";

export async function GET(req: NextRequest) {
  const session = await verifyEmbeddedSession(req.headers.get("authorization"));
  if (!session) return NextResponse.json({ error: "انتهت الجلسة" }, { status: 401 });
  return NextResponse.json({ summary: await buildEmbeddedSummary(session.tenantId) });
}
