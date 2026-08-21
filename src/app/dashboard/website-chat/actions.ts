"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getTenantChatbotLimits } from "@/lib/planLimits";

/** يفعّل/يوقف ويدجت شات موقع التاجر الخاص — نفس فحص بوابة الباقة الخادمي في updateAiAgentConfig
 * (دفاع ضد التلاعب المباشر متجاوزاً الواجهة، وليس فقط إخفاء الصفحة). */
export async function updateWebsiteChatConfig(formData: FormData) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.edit");
  const tenantId = session.user.tenantId;

  const limits = await getTenantChatbotLimits(tenantId);
  if (!limits.websiteChatEnabled) {
    throw new Error("شات موقعك الخاص متاح فقط من باقة النمو فأعلى — يرجى ترقية باقتك أولاً.");
  }

  const websiteWidgetActive = formData.get("websiteWidgetActive") === "on";

  await withTenant(tenantId, (tx) =>
    tx.aiAgentConfig.upsert({
      where: { tenantId },
      update: { websiteWidgetActive },
      create: { tenantId, websiteWidgetActive },
    })
  );

  await writeAuditLog({
    tenantId, userId: session.user.id, action: "website_chat.config_update", targetType: "AiAgentConfig",
    metaJson: { websiteWidgetActive },
  });

  revalidatePath("/dashboard/website-chat");
}
