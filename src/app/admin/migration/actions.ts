"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { cancelMigrationInvite, completeMigration, inviteTenantsToMigration } from "@/lib/integrations/migration";

type Result = { ok: boolean; message: string } | null;

async function guard() {
  const session = await requireSuperAdminSession();
  requireEffectivePermission(session.user.permissions, "platform.manage_tenants");
  return session;
}

/** دعوة التجار المحددين (دفعة تدريجية) للنقل إلى 360dialog. */
export async function inviteSelected(_prev: Result, formData: FormData): Promise<Result> {
  const session = await guard();
  const ids = formData.getAll("tenantId").map(String).filter(Boolean);
  if (ids.length === 0) return { ok: false, message: "اختر تاجراً واحداً على الأقل" };
  if (ids.length > 50) return { ok: false, message: "الحد الأقصى 50 تاجراً في الدفعة الواحدة — النقل تدريجي" };
  const { invited, skipped } = await inviteTenantsToMigration(ids, session.user.id);
  revalidatePath("/admin/migration");
  return { ok: true, message: `دُعي ${invited} تاجر${skipped ? ` · تُخطّي ${skipped} (مدعو مسبقاً أو غير مربوط)` : ""}` };
}

export async function cancelInvite(tenantId: string) {
  const session = await guard();
  await cancelMigrationInvite(tenantId, session.user.id);
  revalidatePath("/admin/migration");
}

export async function finalizeMigration(_prev: Result, formData: FormData): Promise<Result> {
  const session = await guard();
  try {
    await completeMigration(String(formData.get("tenantId") ?? ""), session.user.id);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذّر إنهاء النقل" };
  }
  revalidatePath("/admin/migration");
  return { ok: true, message: "اكتمل النقل وفُصل الربط القديم" };
}
