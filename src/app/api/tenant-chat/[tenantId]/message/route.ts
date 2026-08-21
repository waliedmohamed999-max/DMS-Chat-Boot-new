import { NextRequest, NextResponse } from "next/server";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { processTenantChatMessage } from "@/lib/tenantChat";

export async function POST(req: NextRequest, { params }: { params: { tenantId: string } }) {
  const tenantId = params.tenantId;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "tenant-chat-message", 30, 60);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "عدد رسائل كبير جداً من عنوانك الحالي — حاول مرة أخرى بعد قليل" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const text = typeof body?.text === "string" ? body.text : "";
  if (!sessionId || !text.trim()) {
    return NextResponse.json({ error: "sessionId ونص الرسالة مطلوبان" }, { status: 400 });
  }

  try {
    const result = await processTenantChatMessage(tenantId, sessionId, text, false);
    if (result.kind === "error") {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    return NextResponse.json({ replyText: result.replyText, sessionStatus: result.sessionStatus });
  } catch {
    return NextResponse.json({ error: "متجر غير موجود" }, { status: 404 });
  }
}
