import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";

/** ينشئ جلسة شات جديدة للموقع التسويقي العام — بلا تسجيل دخول، بلا كوكي (الجلسة تعيش في state
 * محلي على المتصفح فقط، تنتهي بإغلاق التبويب عمداً، بساطة مرحلة أولى). */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "platform-chat-new-session", 5, 300);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "عدد جلسات كبير جداً من عنوانك الحالي — حاول مرة أخرى بعد قليل" }, { status: 429 });
  }

  let body: { name?: unknown; email?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // جسم طلب فارغ/غير صالح — الاسم والبريد اختياريان أصلاً
  }

  const session = await rawDb.platformChatSession.create({
    data: {
      visitorName: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 200) : null,
      visitorEmail: typeof body.email === "string" && body.email.trim() ? body.email.trim().slice(0, 200) : null,
    },
  });

  return NextResponse.json({ sessionId: session.id });
}
