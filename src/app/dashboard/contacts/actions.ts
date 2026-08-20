"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { requireEffectivePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import {
  parseAndPreviewImport,
  commitContactImport,
  type DuplicateStrategy,
  type ImportPreviewResult,
  type CommitImportResult,
} from "@/lib/contacts/bulkImport";
import { SAUDI_PHONE_PATTERN } from "@/lib/contacts/phone";
import { z } from "zod";

// ملاحظة: SAUDI_PHONE_PATTERN لا يُعاد تصديرها من هنا — هذا ملف "use server"، وأي تصدير لقيمة غير
// دالة منه يُستبدَل بـstub فارغ على العميل (خلل حقيقي اكتُشف سابقاً في هذا المشروع). المصدر الوحيد
// للنمط هو lib/contacts/phone.ts مباشرة.

const createContactSchema = z.object({
  name: z.string().min(2, "الاسم قصير جداً"),
  phoneE164: z.string().regex(SAUDI_PHONE_PATTERN, "رقم جوال سعودي غير صالح (مثال: +966501234567)"),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().optional(),
});

export async function createContact(formData: FormData) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.manage");

  const parsed = createContactSchema.safeParse({
    name: formData.get("name"),
    phoneE164: formData.get("phoneE164"),
    email: formData.get("email") || undefined,
    city: formData.get("city") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
  }

  try {
    await withTenant(session.user.tenantId, async (tx) => {
      await tx.contact.create({
        data: {
          tenantId: session.user.tenantId,
          name: parsed.data.name,
          phoneE164: parsed.data.phoneE164,
          email: parsed.data.email || null,
          city: parsed.data.city || null,
          source: "MANUAL",
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("يوجد جهة اتصال بهذا الرقم مسبقاً");
    }
    throw err;
  }

  revalidatePath("/dashboard/contacts");
}

const updateContactSchema = z.object({
  name: z.string().min(2, "الاسم قصير جداً"),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().optional(),
  notes: z.string().optional(),
});

/** تعديل البيانات الأساسية لجهة اتصال (لا يشمل رقم الجوال عمداً — هو المعرّف الفريد لهوية واتساب نفسها). */
export async function updateContact(contactId: string, formData: FormData) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.manage");

  const parsed = updateContactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    city: formData.get("city") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");

  await withTenant(session.user.tenantId, (tx) =>
    tx.contact.update({
      where: { id: contactId, tenantId: session.user.tenantId },
      data: {
        name: parsed.data.name,
        email: parsed.data.email || null,
        city: parsed.data.city || null,
        notes: parsed.data.notes || null,
      },
    })
  );

  revalidatePath(`/dashboard/contacts/${contactId}`);
}

export async function updateContactStage(contactId: string, stage: "LEAD" | "CONTACTED" | "CUSTOMER" | "REPEAT") {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.manage");

  await withTenant(session.user.tenantId, async (tx) => {
    await tx.contact.update({
      where: { id: contactId, tenantId: session.user.tenantId },
      data: { stage },
    });
  });

  revalidatePath("/dashboard/contacts");
  revalidatePath(`/dashboard/contacts/${contactId}`);
}

/** null = "غير محدد" (لم تُطلَب الموافقة بعد) — قيمة مختلفة صراحة عن false ("رفض الموافقة"). */
export async function updateContactOptIn(contactId: string, optIn: boolean | null) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.manage");

  await withTenant(session.user.tenantId, (tx) =>
    tx.contact.update({
      where: { id: contactId, tenantId: session.user.tenantId },
      data: { marketingOptIn: optIn, optInUpdatedAt: new Date() },
    })
  );

  await writeAuditLog({
    tenantId: session.user.tenantId, userId: session.user.id,
    action: "contact.opt_in_change", targetType: "Contact", targetId: contactId,
    metaJson: { optIn },
  });

  revalidatePath(`/dashboard/contacts/${contactId}`);
}

export async function addTagToContact(contactId: string, tagName: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.manage");
  const name = tagName.trim();
  if (!name) throw new Error("اسم الوسم مطلوب");

  await withTenant(session.user.tenantId, async (tx) => {
    const tag = await tx.tag.upsert({
      where: { tenantId_name: { tenantId: session.user.tenantId, name } },
      update: {},
      create: { tenantId: session.user.tenantId, name },
    });
    await tx.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId: tag.id } },
      update: {},
      create: { contactId, tagId: tag.id },
    });
  });

  revalidatePath(`/dashboard/contacts/${contactId}`);
}

export async function removeTagFromContact(contactId: string, tagId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.manage");

  await withTenant(session.user.tenantId, (tx) =>
    tx.contactTag.deleteMany({ where: { contactId, tagId } })
  );

  revalidatePath(`/dashboard/contacts/${contactId}`);
}

export async function deleteContact(contactId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.delete");

  await withTenant(session.user.tenantId, async (tx) => {
    await tx.contact.delete({ where: { id: contactId, tenantId: session.user.tenantId } });
  });

  await writeAuditLog({
    tenantId: session.user.tenantId, userId: session.user.id,
    action: "contact.delete", targetType: "Contact", targetId: contactId,
  });

  revalidatePath("/dashboard/contacts");
}

// ========================= إجراءات جماعية (Bulk Actions) =========================

export async function bulkDeleteContacts(contactIds: string[]) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.delete");
  if (contactIds.length === 0) return { deletedCount: 0 };

  const { count } = await withTenant(session.user.tenantId, (tx) =>
    tx.contact.deleteMany({ where: { tenantId: session.user.tenantId, id: { in: contactIds } } })
  );

  await writeAuditLog({
    tenantId: session.user.tenantId, userId: session.user.id,
    action: "contact.bulk_delete", targetType: "Contact",
    metaJson: { count, contactIds },
  });

  revalidatePath("/dashboard/contacts");
  return { deletedCount: count };
}

export async function bulkTagContacts(contactIds: string[], tagName: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.manage");
  const name = tagName.trim();
  if (!name || contactIds.length === 0) throw new Error("اختر جهات اتصال واسم وسم صالح");

  await withTenant(session.user.tenantId, async (tx) => {
    const tag = await tx.tag.upsert({
      where: { tenantId_name: { tenantId: session.user.tenantId, name } },
      update: {},
      create: { tenantId: session.user.tenantId, name },
    });
    for (const contactId of contactIds) {
      await tx.contactTag.upsert({
        where: { contactId_tagId: { contactId, tagId: tag.id } },
        update: {},
        create: { contactId, tagId: tag.id },
      });
    }
  });

  revalidatePath("/dashboard/contacts");
}

/**
 * يضيف تحديداً يدوياً كجمهور مباشر لحملة جديدة: ينشئ وسماً داخلياً (isSystem) يربط هذا التحديد
 * تحديداً، ثم يُحوِّل المستخدم لمعالج إنشاء حملة جديدة مع هذا الوسم كفلتر شريحة جاهز — يعيد استخدام
 * آلية "شريحة مخصصة" الموجودة أصلاً بلا أي تعديل على معالج الحملة أو resolveAudienceWhere.
 */
export async function bulkAddToCampaignAudience(contactIds: string[]) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "campaigns.manage");
  if (contactIds.length === 0) throw new Error("اختر جهات اتصال أولاً");

  const tagName = `جمهور مُحدَّد يدوياً ${new Date().toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}`;
  const tag = await withTenant(session.user.tenantId, async (tx) => {
    const t = await tx.tag.create({ data: { tenantId: session.user.tenantId, name: tagName, isSystem: true } });
    for (const contactId of contactIds) {
      await tx.contactTag.create({ data: { contactId, tagId: t.id } });
    }
    return t;
  });

  redirect(`/dashboard/campaigns/new?audienceTagId=${tag.id}`);
}

// ========================= الاستيراد (معاينة ثم تأكيد) =========================

export type { ImportPreviewResult, CommitImportResult };

/** الخطوة 1: يحلّل الملف ويعرض معاينة (بلا أي كتابة على القاعدة بعد) — بند 3 في البرومنت. */
export async function previewContactImport(formData: FormData): Promise<ImportPreviewResult> {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.manage");

  const rateLimit = await checkTenantRateLimit(session.user.tenantId, "bulk-import", 5, 3600);
  if (!rateLimit.allowed) {
    return { success: false, error: "عدد عمليات الاستيراد كبير جداً خلال ساعة — حاول مرة أخرى لاحقاً." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "لم يتم اختيار ملف صالح." };
  }

  return parseAndPreviewImport(session.user.tenantId, file);
}

/** الخطوة 2: يؤكد الاستيراد فعلياً بعد مراجعة المعاينة، باستراتيجية معالجة تكرار مختارة صراحة. */
export async function confirmContactImport(sessionId: string, duplicateStrategy: DuplicateStrategy): Promise<CommitImportResult> {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.manage");

  const result = await commitContactImport(session.user.tenantId, session.user.id, sessionId, duplicateStrategy, "IMPORT");
  if (!result.success) return result;

  await writeAuditLog({
    tenantId: session.user.tenantId, userId: session.user.id,
    action: "contact.bulk_import", targetType: "ContactImportBatch", targetId: result.batchId,
    metaJson: { imported: result.imported, updated: result.updated, skipped: result.skipped },
  });

  revalidatePath("/dashboard/contacts");
  return result;
}

const UNDO_IMPORT_WINDOW_MINUTES = 10;

/** يتراجع عن دفعة استيراد كاملة — يحذف فقط الجهات **الجديدة فعلياً** بهذه الدفعة (وليس التي كانت
 * موجودة مسبقاً وتم تحديثها فقط، إذ لا نملك نسخة سابقة من بياناتها لاستعادتها). متاح لفترة قصيرة فقط. */
export async function undoImportBatch(batchId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "contacts.manage");
  const tenantId = session.user.tenantId;

  const batch = await withTenant(tenantId, (tx) => tx.contactImportBatch.findUnique({ where: { id: batchId, tenantId } }));
  if (!batch) throw new Error("دفعة الاستيراد غير موجودة");

  const ageMinutes = (Date.now() - batch.createdAt.getTime()) / 60000;
  if (ageMinutes > UNDO_IMPORT_WINDOW_MINUTES) {
    throw new Error(`لا يمكن التراجع بعد ${UNDO_IMPORT_WINDOW_MINUTES} دقائق من الاستيراد.`);
  }

  const { count } = await withTenant(tenantId, (tx) =>
    tx.contact.deleteMany({ where: { tenantId, importBatchId: batchId } })
  );

  await writeAuditLog({
    tenantId, userId: session.user.id,
    action: "contact.import_undo", targetType: "ContactImportBatch", targetId: batchId,
    metaJson: { deletedCount: count },
  });

  revalidatePath("/dashboard/contacts");
  return { deletedCount: count };
}
