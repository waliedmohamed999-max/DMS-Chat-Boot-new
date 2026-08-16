import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getActiveImpersonation } from "@/lib/impersonation";
import { getPlatformSession } from "@/lib/platformAuth";
import { superAdminDb } from "@/lib/db";
import { isPlatformRole } from "@/lib/rbac";

export type ImpersonationInfo = { active: true; superAdminName: string; tenantName: string } | { active: false };

/**
 * يفحص أولاً وجود جلسة انتحال هوية فعّالة (كوكي منفصل عن next-auth) قبل الرجوع للجلسة الحقيقية.
 * هذا يعني أن جلسة NextAuth الأصلية لمالك المنصة تبقى سليمة تحتها طوال وقت الانتحال.
 */
export async function getCurrentSession() {
  const impersonation = await getActiveImpersonation();
  if (impersonation) {
    const targetUser = await superAdminDb.user.findUnique({ where: { id: impersonation.targetUserId } });
    if (targetUser) {
      return {
        user: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
          tenantId: targetUser.tenantId,
          impersonation: { active: true, superAdminName: impersonation.superAdminName, tenantName: impersonation.tenantName } as ImpersonationInfo,
        },
      };
    }
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) return session;
  return {
    ...session,
    user: { ...session.user, impersonation: { active: false } as ImpersonationInfo },
  };
}

/** يفرض جلسة تاجر صالحة (OWNER/ADMIN/AGENT) ويعيد التوجيه لتسجيل الدخول إن غابت. */
export async function requireTenantSession() {
  const session = await getCurrentSession();
  if (!session?.user || isPlatformRole(session.user.role) || !session.user.tenantId) {
    redirect("/login");
  }
  return session as typeof session & {
    user: {
      id: string; role: "OWNER" | "ADMIN" | "AGENT"; tenantId: string; name?: string | null; email?: string | null;
      impersonation: ImpersonationInfo;
    };
  };
}

/**
 * يفرض جلسة أحد أدوار فريق المنصة الداخلي (مالك المنصة/دعم فني/مالي) ويعيد التوجيه إن غابت.
 *
 * يفحص أولاً كوكي جلسة المنصة المستقل (dms_platform_session، عبر /admin-login) — إن وُجد وصالح،
 * يُستخدم مباشرة ولا يمس كوكي NextAuth إطلاقاً، فيتعايش مع أي جلسة تاجر نشطة في نفس المتصفح.
 * إن غاب، يرجع لفحص جلسة NextAuth العادية (توافق خلفي كامل مع تسجيل الدخول من /login القديم).
 */
export async function requireSuperAdminSession() {
  const platformUser = await getPlatformSession();
  if (platformUser) {
    return {
      // يميّز الطبقة المستدعية (admin/layout.tsx) بين الجلستين لاختيار سلوك تسجيل الخروج الصحيح:
      // "platform" يمسح كوكي dms_platform_session فقط، فلا يمس أي جلسة تاجر (NextAuth) نشطة في
      // نفس المتصفح. لا علاقة له بصلاحيات RBAC — تلك تعتمد فقط على user.role كما هي دائماً.
      authSource: "platform" as const,
      user: {
        id: platformUser.id,
        role: platformUser.role,
        name: platformUser.name,
        email: platformUser.email,
      },
    };
  }

  const session = await getCurrentSession();
  if (!session?.user || !isPlatformRole(session.user.role)) {
    redirect("/admin-login");
  }
  return {
    ...session,
    authSource: "nextauth" as const,
  } as typeof session & {
    authSource: "nextauth";
    user: { id: string; role: "SUPER_ADMIN" | "PLATFORM_SUPPORT" | "PLATFORM_BILLING"; name?: string | null; email?: string | null };
  };
}
