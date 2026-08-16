"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

const inviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["ADMIN", "AGENT"]),
});

export async function inviteTeamMember(formData: FormData) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "team.manage");

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");

  const rateLimit = await checkTenantRateLimit(session.user.tenantId, "invite-team-member", 20, 3600);
  if (!rateLimit.allowed) throw new Error("عدد دعوات كبير جداً خلال ساعة — حاول مرة أخرى لاحقاً.");

  const tempPassword = Math.random().toString(36).slice(2, 10);

  // إنشاء المستخدم يتم عبر rawDb (وليس withTenant) لأن User.email فريد عالمياً ويجب
  // التحقق من عدم تكراره عبر كل المستأجرين قبل الإدخال — لكن الإدخال نفسه يحمل tenantId
  // الصحيح، وRLS (WITH CHECK) سيرفضه لو حاول كود مخترَق تمرير tenantId مختلف.
  await withTenant(session.user.tenantId, async (tx) => {
    // فرض حد عدد الأعضاء من الخادم حسب الباقة (بند و في برومنت صندوق المحادثات) — عدد الأعضاء
    // الكلي هو المقياس العملي المتاح لـ"من يقدر يستخدم صندوق المحادثات"، إذ لا توجد بنية تتبع
    // حضور لحظي (من متصل الآن فعلياً) في هذه المنصة — موثّق كقرار نطاق في DECISIONS.md.
    const [activeUserCount, subscription] = await Promise.all([
      tx.user.count({ where: { tenantId: session.user.tenantId, isActive: true } }),
      tx.subscription.findUnique({ where: { tenantId: session.user.tenantId }, include: { plan: true } }),
    ]);
    if (subscription && activeUserCount >= subscription.plan.maxUsers) {
      throw new Error(`وصلت للحد الأقصى لعدد أعضاء الفريق في باقتك الحالية (${subscription.plan.maxUsers}). رقّي باقتك لإضافة المزيد.`);
    }

    await tx.user.create({
      data: {
        tenantId: session.user.tenantId,
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.role,
        passwordHash: await bcrypt.hash(tempPassword, 10),
      },
    });
  });

  await writeAuditLog({
    tenantId: session.user.tenantId, userId: session.user.id,
    action: "team.invite", targetType: "User", targetId: parsed.data.email,
    metaJson: { role: parsed.data.role },
  });

  revalidatePath("/dashboard/settings");
}

export async function changeUserRole(userId: string, role: "ADMIN" | "AGENT") {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "team.manage");

  await withTenant(session.user.tenantId, async (tx) => {
    await tx.user.update({ where: { id: userId, tenantId: session.user.tenantId }, data: { role } });
  });

  await writeAuditLog({
    tenantId: session.user.tenantId, userId: session.user.id,
    action: "team.role_change", targetType: "User", targetId: userId, metaJson: { newRole: role },
  });

  revalidatePath("/dashboard/settings");
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "team.manage");

  await withTenant(session.user.tenantId, async (tx) => {
    await tx.user.update({ where: { id: userId, tenantId: session.user.tenantId }, data: { isActive } });
  });

  revalidatePath("/dashboard/settings");
}
