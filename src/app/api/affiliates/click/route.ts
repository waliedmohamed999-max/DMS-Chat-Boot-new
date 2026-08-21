import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/rateLimit";

/** يسجّل نقرة خام على رابط إحالة (?ref=CODE) — عامة تماماً بلا مصادقة (أي زائر مجهول يستدعيها فعلياً
 * عبر useCaptureReferral)، فمحمية بحد معدّل بعنوان IP فقط، نفس نمط أي نقطة عامة أخرى في المشروع. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkIpRateLimit(ip, "affiliate-click", 20, 60);
  if (!ipLimit.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const source = typeof body?.source === "string" ? body.source.slice(0, 40) : null;
  if (!code) return NextResponse.json({ ok: false }, { status: 400 });

  // بلا تحقّق ACTIVE هنا عمداً (خلافاً لـresolveReferralAffiliateId التي تُستخدَم وقت التحويل الفعلي) —
  // نُسجّل النقرة حتى لو المسوّق PENDING/SUSPENDED مؤقتاً (بيانات تاريخية مفيدة لمراجعة لاحقة)، لكن لا
  // نمنحها عمولة أبداً بالطبع (ذلك القرار يبقى حصرياً في resolveReferralAffiliateId/commissionSync).
  const affiliate = await rawDb.affiliate.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (!affiliate) return NextResponse.json({ ok: false }, { status: 404 });

  await rawDb.referralClick.create({ data: { affiliateId: affiliate.id, source } });
  return NextResponse.json({ ok: true });
}
