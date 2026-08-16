import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { rawDb } from "@/lib/db";

const COOKIE_NAME = "dms_affiliate_session";
const MAX_AGE_SECONDS = 30 * 24 * 3600;

function getSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET غير مضبوط — لا يمكن توقيع جلسة المسوّق");
  return new TextEncoder().encode(secret);
}

/**
 * جلسة مستقلة تماماً عن NextAuth وعن dms_platform_session (كوكي ثالث مختلف الاسم بنفس أسلوب
 * lib/platformAuth.ts) — المسوّق ليس تاجراً (لا Tenant) ولا موظف منصة (لا صلاحيات RBAC)، فهو نوع
 * جلسة ثالث كلياً. اسم كوكي مختلف = تتعايش الثلاث جلسات في نفس المتصفح بلا أي تعارض.
 */
export async function setAffiliateSession(affiliateId: string): Promise<void> {
  const token = await new SignJWT({ aid: affiliateId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearAffiliateSession(): Promise<void> {
  cookies().delete(COOKIE_NAME);
}

/** يتحقق من الكوكي ثم يُعيد جلب سجل المسوّق حياً من القاعدة (وليس من الـJWT فقط) — بحيث تعليق
 * حساب مسوّق من admin/affiliates يسري فوراً على الجلسة القائمة، لا ينتظر انتهاء صلاحية التوكن. */
export async function getAffiliateSession() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  let affiliateId: string;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.aid !== "string") return null;
    affiliateId = payload.aid;
  } catch {
    return null;
  }

  return rawDb.affiliate.findUnique({ where: { id: affiliateId } });
}

/** يفرض جلسة مسوّق نشطة (ACTIVE فقط) ويعيد التوجيه لصفحة الدخول إن غابت أو كانت معلَّقة/بانتظار المراجعة. */
export async function requireAffiliateSession() {
  const affiliate = await getAffiliateSession();
  if (!affiliate || affiliate.status !== "ACTIVE") {
    redirect("/affiliates/login");
  }
  return affiliate!;
}
