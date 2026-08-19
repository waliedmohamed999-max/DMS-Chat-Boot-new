import { NextRequest, NextResponse } from "next/server";

// دول مدعومة فعلياً على المنصة فقط — أي دولة أخرى يكتشفها البحث الجغرافي تُتجاهَل (يبقى الافتراضي:
// السعودية) بدل عرض مبدّل عملة لدولة لا تدعمها المنصة أصلاً.
const SUPPORTED_COUNTRIES = new Set(["SA", "AE", "EG"]);

/**
 * كشف دولة الزائر تلقائياً من عنوان IP (بلا أي إذن متصفح، بنفس فكرة اكتشاف جوجل التلقائي لدولتك) —
 * يُستدعى مرة واحدة فقط من CountryProvider لزائر بلا كوكي دولة محفوظ مسبقاً. لا مفتاح API ولا تكلفة
 * (ip-api.com مجاني بلا تسجيل لعدد طلبات معقول) — أي فشل/بطء يُعاد بصمت كـ{country: null} فيبقى
 * الزائر على الدولة الافتراضية للمنصة بدل كسر الصفحة أو الانتظار.
 */
export async function GET(req: NextRequest) {
  try {
    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwardedFor || req.headers.get("x-real-ip") || req.ip;

    // بيئة محلية/بلا IP حقيقي قابل للتحديد — لا معنى لاستدعاء خدمة خارجية.
    if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
      return NextResponse.json({ country: null });
    }

    const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return NextResponse.json({ country: null });

    const data = (await res.json()) as { countryCode?: string };
    const country = data.countryCode && SUPPORTED_COUNTRIES.has(data.countryCode) ? data.countryCode : null;
    return NextResponse.json({ country });
  } catch {
    return NextResponse.json({ country: null });
  }
}
