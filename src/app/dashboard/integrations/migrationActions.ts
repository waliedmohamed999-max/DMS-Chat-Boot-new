"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { completeMigration, saveMigrationFeedback } from "@/lib/integrations/migration";

type Result = { ok: boolean; message: string } | null;

/** التاجر ينهي النقل بنفسه بعد جاهزية قناة 360dialog — يفصل ربط Meta المباشر القديم. */
export async function finishMyMigration(_prev: Result, _formData: FormData): Promise<Result> {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "integrations.manage");
  try {
    await completeMigration(session.user.tenantId, session.user.id);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذّر إنهاء النقل" };
  }
  revalidatePath("/dashboard/integrations");
  return { ok: true, message: "تم النقل بنجاح 🎉" };
}

export async function sendMigrationFeedback(_prev: Result, formData: FormData): Promise<Result> {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "integrations.manage");
  try {
    await saveMigrationFeedback(session.user.tenantId, session.user.id, Number(formData.get("rating")), String(formData.get("comment") ?? ""));
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذّر حفظ التقييم" };
  }
  revalidatePath("/dashboard/integrations");
  return { ok: true, message: "شكراً لتقييمك!" };
}
