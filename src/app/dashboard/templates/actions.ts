"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { requireEffectivePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { submitTemplateForApproval, type TemplateButtonInput } from "@/lib/integrations/meta/templates";
import { z } from "zod";

const templateSchema = z.object({
  name: z.string().min(2, "اسم القالب قصير جداً").regex(/^[a-z0-9_]+$/, "الاسم بأحرف إنجليزية صغيرة وأرقام و_ فقط (مثال: order_status_update)"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  language: z.string().min(2).max(5),
  headerType: z.enum(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"]).default("NONE"),
  headerText: z.string().optional(),
  bodyText: z.string().min(10, "نص الرسالة قصير جداً"),
  footerText: z.string().optional(),
  buttonsJson: z.string().optional(),
});

function parseButtons(raw: string | undefined): TemplateButtonInput[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((b) => b && typeof b.text === "string" && b.text.trim())
      .map((b) => ({ type: b.type, text: b.text, value: b.value || undefined }));
  } catch {
    return [];
  }
}

export async function createTemplate(formData: FormData) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "campaigns.manage");
  const tenantId = session.user.tenantId;

  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    language: formData.get("language") || "ar",
    headerType: formData.get("headerType") || "NONE",
    headerText: formData.get("headerText") || undefined,
    bodyText: formData.get("bodyText"),
    footerText: formData.get("footerText") || undefined,
    buttonsJson: formData.get("buttonsJson") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");

  const buttons = parseButtons(parsed.data.buttonsJson);
  const editFrom = String(formData.get("editFrom") ?? "").trim();

  if (editFrom) {
    // إعادة إرسال بعد تعديل قالب مرفوض/معلَّق — يُحذف القديم أولاً لتفادي تعارض القيد الفريد
    // (tenantId+name+language) لو أُعيد الاسم نفسه، قبل إنشاء الصف الجديد.
    await withTenant(tenantId, async (tx) => {
      const old = await tx.messageTemplate.findUnique({ where: { id: editFrom, tenantId } });
      if (old && ["REJECTED", "PAUSED", "DISABLED"].includes(old.status)) {
        await tx.messageTemplate.delete({ where: { id: editFrom } });
      }
    });
  }

  // يبدأ دائماً PENDING فعلياً — لا اعتماد تلقائي أبداً، بصرف النظر عن نجاح الإرسال لـ Meta
  const template = await withTenant(tenantId, (tx) =>
    tx.messageTemplate.create({
      data: {
        tenantId, name: parsed.data.name, category: parsed.data.category, language: parsed.data.language,
        headerType: parsed.data.headerType === "NONE" ? null : parsed.data.headerType,
        headerText: parsed.data.headerType === "TEXT" ? parsed.data.headerText : null,
        bodyText: parsed.data.bodyText, footerText: parsed.data.footerText || null,
        buttonsJson: buttons.length ? (buttons as never) : undefined,
        status: "PENDING", submittedAt: new Date(),
      },
    })
  );

  try {
    const { externalTemplateId } = await submitTemplateForApproval(tenantId, template.id, {
      name: parsed.data.name, category: parsed.data.category, language: parsed.data.language,
      headerType: parsed.data.headerType, headerText: parsed.data.headerText,
      bodyText: parsed.data.bodyText, footerText: parsed.data.footerText, buttons,
    });
    await withTenant(tenantId, (tx) => tx.messageTemplate.update({ where: { id: template.id }, data: { externalTemplateId } }));
  } catch (e) {
    // فشل الإرسال الفعلي لـ Graph API (وليس رفض المراجعة نفسها) — يُعرض للتاجر فوراً وليس "قيد المراجعة" زوراً
    const message = e instanceof Error ? e.message : "فشل إرسال القالب لمراجعة Meta";
    await withTenant(tenantId, (tx) => tx.messageTemplate.update({ where: { id: template.id }, data: { status: "REJECTED", rejectionReason: message } }));
    throw new Error(message);
  }

  await writeAuditLog({
    tenantId, userId: session.user.id,
    action: "template.submit_for_review", targetType: "MessageTemplate", targetId: template.id, metaJson: { name: parsed.data.name },
  });

  revalidatePath("/dashboard/templates");
}

/** يفتح المعالج بنفس محتوى قالب مرفوض/معلَّق لتعديله وإعادة إرساله — القوالب لا تُعدَّل في واتساب مباشرة. */
export async function resubmitTemplateRedirect(templateId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "campaigns.manage");

  const template = await withTenant(session.user.tenantId, (tx) =>
    tx.messageTemplate.findUniqueOrThrow({ where: { id: templateId, tenantId: session.user.tenantId } })
  );
  if (template.status !== "REJECTED" && template.status !== "PAUSED" && template.status !== "DISABLED") {
    throw new Error("التعديل وإعادة الإرسال متاحان فقط للقوالب المرفوضة أو المعلَّقة أو الموقوفة.");
  }

  redirect(`/dashboard/templates/new?editFrom=${template.id}`);
}

/** يحذف القالب القديم المرفوض/المعلَّق فعلياً عند إعادة الإرسال بنفس الاسم (القيد الفريد tenantId+name+language). */
export async function deleteSupersededTemplate(templateId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "campaigns.manage");

  await withTenant(session.user.tenantId, async (tx) => {
    const template = await tx.messageTemplate.findUniqueOrThrow({ where: { id: templateId, tenantId: session.user.tenantId } });
    if (template.status !== "REJECTED" && template.status !== "PAUSED" && template.status !== "DISABLED") {
      throw new Error("لا يمكن حذف قالب معتمد أو قيد المراجعة.");
    }
    await tx.messageTemplate.delete({ where: { id: templateId } });
  });

  revalidatePath("/dashboard/templates");
}
