import crypto from "crypto";
import { cookies } from "next/headers";
import { superAdminDb } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const IMPERSONATION_COOKIE = "impersonation_token";
const SESSION_DURATION_MINUTES = 30;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export type ActiveImpersonation = {
  sessionId: string;
  tenantId: string;
  tenantName: string;
  targetUserId: string;
  superAdminName: string;
};

/**
 * يبدأ جلسة انتحال هوية لأغراض الدعم الفني: يختار مالك حساب التاجر (OWNER) كمستخدم مستهدف،
 * ينشئ رمزاً عشوائياً قصير الأجل (30 دقيقة) يُخزَّن مُجزَّأً (SHA-256) في قاعدة البيانات، ويضبط
 * كوكي httpOnly بالرمز الخام. لا يمس جلسة NextAuth الحقيقية لمالك المنصة إطلاقاً — عند إنهاء
 * الانتحال يعود مالك المنصة تلقائياً لجلسته الأصلية لأن الكوكي الحقيقي (next-auth.session-token)
 * لم يُلمَس قط، وكوكي الانتحال مجرد طبقة تفوق (override) تُفحص أولاً في getCurrentSession().
 */
export async function startImpersonation(tenantId: string, superAdminUserId: string): Promise<void> {
  const tenant = await superAdminDb.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const targetUser = await superAdminDb.user.findFirst({
    where: { tenantId, role: "OWNER", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!targetUser) throw new Error("لا يوجد مستخدم Owner نشط لهذا التاجر لتسجيل الدخول نيابة عنه");

  const superAdmin = await superAdminDb.user.findUniqueOrThrow({ where: { id: superAdminUserId } });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MINUTES * 60 * 1000);

  await superAdminDb.impersonationSession.create({
    data: {
      tenantId,
      superAdminId: superAdminUserId,
      targetUserId: targetUser.id,
      tokenHash: hashToken(rawToken),
      expiresAt,
    },
  });

  cookies().set(IMPERSONATION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_MINUTES * 60,
    path: "/",
  });

  // سجل مزدوج للشفافية: في سجل تدقيق المنصة (بلا tenantId) وفي سجل تدقيق التاجر نفسه (يظهر له).
  await superAdminDb.auditLog.create({
    data: {
      userId: superAdminUserId, action: "platform.impersonation_start",
      targetType: "Tenant", targetId: tenantId, metaJson: { tenantName: tenant.name, asUser: targetUser.email },
    },
  });
  await writeAuditLog({
    tenantId, userId: targetUser.id, action: "support.impersonation_started",
    targetType: "Tenant", targetId: tenantId,
    metaJson: { byPlatformStaff: superAdmin.name, byPlatformStaffEmail: superAdmin.email },
  });
}

export async function endImpersonation(): Promise<void> {
  const cookieStore = cookies();
  const rawToken = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    const session = await superAdminDb.impersonationSession.findUnique({ where: { tokenHash } });
    if (session && !session.endedAt) {
      await superAdminDb.impersonationSession.update({ where: { id: session.id }, data: { endedAt: new Date() } });
      await superAdminDb.auditLog.create({
        data: {
          userId: session.superAdminId, action: "platform.impersonation_end",
          targetType: "Tenant", targetId: session.tenantId,
        },
      });
    }
  }
  cookieStore.delete(IMPERSONATION_COOKIE);
}

/** يُستدعى من getCurrentSession() فقط — لا يُستخدم مباشرة في أي مكان آخر. */
export async function getActiveImpersonation(): Promise<ActiveImpersonation | null> {
  const rawToken = cookies().get(IMPERSONATION_COOKIE)?.value;
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const session = await superAdminDb.impersonationSession.findUnique({
    where: { tokenHash },
    include: { tenant: true, superAdmin: true },
  });

  if (!session || session.endedAt || session.expiresAt < new Date()) return null;

  return {
    sessionId: session.id,
    tenantId: session.tenantId,
    tenantName: session.tenant.name,
    targetUserId: session.targetUserId,
    superAdminName: session.superAdmin.name,
  };
}
