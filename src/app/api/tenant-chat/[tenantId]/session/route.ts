import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";
import { getTenantChatbotLimits } from "@/lib/planLimits";

/** ينشئ جلسة شات جديدة لويدجت موقع تاجر معيّن (بلا تسجيل دخول، بلا كوكي — نفس فلسفة
 * /api/platform-chat/session، لكن يفحص بوابة الباقة + تفعيل التاجر الصريح قبل إنشاء أي جلسة، لأن هذا
 * المسار عام تماماً وtenantId يأتي من رابط الـiframe نفسه (قابل للتخمين/الزيارة المباشرة). */
export async function POST(req: NextRequest, { params }: { params: { tenantId: string } }) {
  const tenantId = params.tenantId;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "tenant-chat-new-session", 5, 300);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "عدد جلسات كبير جداً من عنوانك الحالي — حاول مرة أخرى بعد قليل" }, { status: 429 });
  }

  let body: { name?: unknown; email?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // جسم طلب فارغ/غير صالح — الاسم والبريد اختياريان أصلاً
  }

  try {
    const limits = await getTenantChatbotLimits(tenantId);
    if (!limits.websiteChatEnabled) {
      return NextResponse.json({ error: "شات الموقع غير متاح لهذا المتجر" }, { status: 403 });
    }

    const config = await withTenant(tenantId, (tx) => tx.aiAgentConfig.findUnique({ where: { tenantId } }));
    if (!config?.enabled || !config?.websiteWidgetActive) {
      return NextResponse.json({ error: "شات الموقع غير مفعّل حالياً لهذا المتجر" }, { status: 503 });
    }

    const session = await withTenant(tenantId, (tx) =>
      tx.tenantChatSession.create({
        data: {
          tenantId,
          visitorName: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 200) : null,
          visitorEmail: typeof body.email === "string" && body.email.trim() ? body.email.trim().slice(0, 200) : null,
        },
      })
    );

    return NextResponse.json({ sessionId: session.id });
  } catch {
    return NextResponse.json({ error: "متجر غير موجود" }, { status: 404 });
  }
}
