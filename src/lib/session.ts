import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getActiveImpersonation } from "@/lib/impersonation";
import { getPlatformSession } from "@/lib/platformAuth";
import { superAdminDb, withTenant } from "@/lib/db";
import { isPlatformRole, resolveEffectivePermissions, type Permission } from "@/lib/rbac";

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
          // يمرَّر صراحة (وليس افتراضاً) — فريق الدعم يجب أن يرى أثناء الانتحال بالضبط نفس صلاحيات
          // العضو الفعلية المخصَّصة، لا صلاحيات دوره الافتراضية فقط، وإلا يفقد الانتحال غرضه (تشخيص
          // ما يراه المستخدم الحقيقي فعلياً).
          customPermissionsJson: targetUser.customPermissionsJson,
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
  const typedSession = session as typeof session & {
    user: {
      id: string; role: "OWNER" | "ADMIN" | "AGENT"; tenantId: string; name?: string | null; email?: string | null;
      impersonation: ImpersonationInfo; permissions: Permission[];
    };
  };

  // تعليق/إلغاء تاجر (setTenantStatus) كان يمنع تسجيل دخول جديد فقط (auth.ts) — أي مستخدم لديه
  // جلسة JWT سارية أصلاً (صالحة حتى 7 أيام) يحتفظ بوصول كامل لكل action/صفحة تاجر رغم التعليق، لأن
  // لا شيء كان يُعيد فحص Tenant.status حياً بعد لحظة الدخول. يُفحَص هنا الآن — نقطة الاختناق المشتركة
  // لكل صفحة/action تاجر — بدل الاعتماد فقط على حالة الدخول اللحظية. جلسات الانتحال مستثناة عمداً
  // (فريق الدعم يحتاج الدخول فعلياً لتاجر معلَّق للتحقيق، بنفس مبدأ استثناء وضع الصيانة في
  // dashboard/layout.tsx).
  //
  // نفس المشكلة بالضبط موجودة لصلاحيات العضو المخصَّصة (customPermissionsJson): لو الـOwner غيّر
  // صلاحيات موظف، الموظف لن يرى التغيير حتى ينتهي الـJWT (حتى 7 أيام) بدون هذا الفحص الحي. الاستعلام
  // الحي الوحيد أدناه يحل المشكلتين معاً (تعليق التاجر + دور/صلاحيات قديمة في الـJWT) بدل استعلامين منفصلين.
  if (!typedSession.user.impersonation.active) {
    // User جدول خاضع لـRLS فعلياً (راجع prisma/postgres-rls.sql) — استعلام عبر rawDb مباشرة بلا
    // withTenant() كان سيُرجع null دائماً (app.current_tenant_id غير مضبوط)، فيُطرَد كل مستخدم فوراً
    // من /login. tenantId معروف بالفعل هنا (typedSession.user.tenantId)، فيُستخدَم withTenant() به.
    const freshUser = await withTenant(typedSession.user.tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: typedSession.user.id },
        select: { role: true, customPermissionsJson: true, tenant: { select: { status: true } } },
      })
    );
    if (!freshUser?.tenant) redirect("/login");
    if (freshUser.tenant.status === "SUSPENDED") redirect("/login?reason=tenant_suspended");
    if (freshUser.tenant.status === "CANCELLED") redirect("/login?reason=tenant_cancelled");

    // يحل نفس مشكلة تعليق التاجر: الدور المخزّن في الـJWT قد يكون قديم لو الـOwner غيّر دور هذا
    // العضو مؤخراً (changeUserRole) — نستخدم القيمة الحية من القاعدة هنا فقط لغرض حساب الصلاحيات
    // وعرض الدور، دون التأثير على أي منطق آخر يعتمد على typedSession.user.role.
    typedSession.user.role = freshUser.role as "OWNER" | "ADMIN" | "AGENT";
    typedSession.user.permissions = resolveEffectivePermissions(freshUser);
  } else {
    // فرع الانتحال: targetUser مجلوب بالفعل حياً بالكامل من superAdminDb (بلا select)، فيحمل
    // customPermissionsJson تلقائياً بعد الـmigration — يكفي حساب الصلاحيات منه مباشرة.
    typedSession.user.permissions = resolveEffectivePermissions(typedSession.user);
  }

  return typedSession;
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
