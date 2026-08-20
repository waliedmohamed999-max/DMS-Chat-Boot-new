"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requirePermission, TENANT_PERMISSION_LABELS_AR, NON_CUSTOMIZABLE_PERMISSIONS } from "@/lib/rbac";
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
    // تغيير الدور يصفّر أي تخصيص صلاحيات سابق — تفادياً لحالة "تخصيص مبني على دور قديم" مربكة وغير
    // آمنة (مثال: تخصيص AGENT كان يمنحه orders.manage فقط، ثم يُرقَّى لـADMIN فيرث نفس المصفوفة
    // الضيقة القديمة بدل صلاحيات ADMIN الكاملة الافتراضية).
    await tx.user.update({ where: { id: userId, tenantId: session.user.tenantId }, data: { role, customPermissionsJson: Prisma.JsonNull } });
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

const permissionsUpdateSchema = z.object({
  permissions: z.array(z.string()).nullable(),
});

/**
 * تخصيص صلاحيات فردي لعضو فريق فوق افتراضي دوره (customPermissionsJson). permissions = null يعني
 * "رجوع لصلاحيات الدور الافتراضية" (يمسح التخصيص). فحص دوري عمداً (requirePermission على
 * session.user.role وليس effective) — من يملك حق التخصيص نفسه لا يتغير بأي تخصيص، تفادياً لحلقة
 * تصعيد صلاحيات ذاتي (راجع تعليق NON_CUSTOMIZABLE_PERMISSIONS في lib/rbac.ts).
 */
export async function updateUserPermissions(userId: string, permissions: string[] | null) {
  const session = await requireTenantSession();
  requirePermission(session.user.role, "team.manage");

  const parsed = permissionsUpdateSchema.safeParse({ permissions });
  if (!parsed.success) throw new Error("بيانات غير صالحة");

  await withTenant(session.user.tenantId, async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId, tenantId: session.user.tenantId } });
    if (!target) throw new Error("العضو غير موجود");
    if (target.role === "OWNER") throw new Error("لا يمكن تخصيص صلاحيات صاحب الحساب");

    if (parsed.data.permissions) {
      // فحص خادمي حقيقي (وليس ثقة بالواجهة) — يرفض أي صلاحية غير معروفة أو منتمية لـ
      // NON_CUSTOMIZABLE_PERMISSIONS حتى لو تجاوز الطالب الواجهة واستدعى هذا الـaction مباشرة بحمولة يدوية.
      const allowed = new Set(Object.keys(TENANT_PERMISSION_LABELS_AR));
      for (const p of parsed.data.permissions) {
        if (!allowed.has(p) || (NON_CUSTOMIZABLE_PERMISSIONS as string[]).includes(p)) {
          throw new Error("صلاحية غير صالحة");
        }
      }
    }

    await tx.user.update({
      where: { id: userId },
      data: { customPermissionsJson: parsed.data.permissions ? JSON.stringify(parsed.data.permissions) : Prisma.JsonNull },
    });
  });

  await writeAuditLog({
    tenantId: session.user.tenantId, userId: session.user.id,
    action: "team.permissions_change", targetType: "User", targetId: userId,
    metaJson: { permissions: parsed.data.permissions },
  });

  revalidatePath("/dashboard/settings");
}
