import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "dms_platform_session";
const MAX_AGE_SECONDS = 7 * 24 * 3600;

function getSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET غير مضبوط — لا يمكن توقيع جلسة فريق المنصة");
  return new TextEncoder().encode(secret);
}

export type PlatformSessionUser = {
  id: string;
  role: "SUPER_ADMIN" | "PLATFORM_SUPPORT" | "PLATFORM_BILLING";
  name: string | null;
  email: string;
};

/**
 * جلسة مستقلة تماماً عن كوكي NextAuth (next-auth.session-token) — اسم كوكي مختلف كلياً، فيتعايش
 * الاثنان في نفس المتصفح بلا تعارض. الهدف: موظف منصة يقدر يدخل /admin بينما جلسة تاجر (NextAuth)
 * نشطة بالفعل في نفس المتصفح عبر /login، دون ما إحداهما تطرد التانية.
 *
 * المسار القديم (/login → NextAuth → requireSuperAdminSession) يبقى يعمل كما هو لموظفي المنصة
 * (توافق خلفي كامل) — requireSuperAdminSession() تفحص هذا الكوكي أولاً ثم ترجع لجلسة NextAuth
 * إن غاب، فأي جلسة قديمة قائمة فعلاً لا تنقطع.
 */
export async function setPlatformSession(user: PlatformSessionUser): Promise<void> {
  const token = await new SignJWT({ uid: user.id, role: user.role, name: user.name, email: user.email })
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

export async function getPlatformSession(): Promise<PlatformSessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.uid || !payload.role || !payload.email) return null;
    return {
      id: payload.uid as string,
      role: payload.role as PlatformSessionUser["role"],
      name: (payload.name as string | null) ?? null,
      email: payload.email as string,
    };
  } catch {
    // توقيع غير صالح/منتهي — يُعامَل كغياب جلسة، وليس خطأ يوقف الصفحة.
    return null;
  }
}

export async function clearPlatformSession(): Promise<void> {
  cookies().delete(COOKIE_NAME);
}
