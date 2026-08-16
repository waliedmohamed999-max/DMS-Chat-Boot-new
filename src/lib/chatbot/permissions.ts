import type { UserRole } from "@prisma/client";
import { hasPermission } from "@/lib/rbac";

/** حذف تدفق منشور فعلياً محصور بصلاحية أعلى من حذف مسودة (متاح للمدير أيضاً). */
export function canDeleteFlow(role: UserRole, status: "DRAFT" | "PUBLISHED"): boolean {
  return hasPermission(role, status === "PUBLISHED" ? "chatbot.delete_published" : "chatbot.delete_draft");
}
