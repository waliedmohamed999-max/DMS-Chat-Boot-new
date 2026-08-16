import { withTenant } from "@/lib/db";
import { parseContactsWorkbook, importContactsBatch } from "@/lib/contacts/bulkImport";

export type AudienceImportResult =
  | { success: true; tagId: string; imported: number; updated: number; skipped: number; errors: { row: number; reason: string }[] }
  | { success: false; error: string };

/**
 * يستورد قائمة عملاء من ملف Excel/CSV كجمهور حملة: يستورد جهات الاتصال فعلياً (upsert)، وينشئ Tag
 * **داخلي** (isSystem: true) لهذه الدفعة تحديداً، ويربطه بكل جهة اتصال في الدفعة. لا حاجة لأي تعديل
 * على resolveAudienceWhere/createCampaign/عامل الإرسال — الناتج (tagId) يُستخدَم مباشرة كـ
 * segmentFilter.tagIds بنفس آلية "شريحة مخصصة" الموجودة أصلاً.
 *
 * ملاحظة تاريخية (كانت جذر خلل ظاهر للمستخدم قبل هذه الجولة): اسم هذا الوسم كان يتضمّن طابعاً زمنياً
 * خاماً (`toISOString()`) يظهر مشوَّهاً بصرياً داخل صفحة عربية RTL (bidi) في قوائم الوسوم المرئية.
 * الإصلاح الحقيقي ليس تنسيق التاريخ فقط، بل **عدم عرض هذا الوسم للمستخدم إطلاقاً** — إنه تفصيل تنفيذ
 * داخلي (isSystem) وليس بيانات وسم حقيقية، فيُستبعَد الآن صراحة من كل مكان يعرض وسوم جهة الاتصال
 * (contacts/page.tsx, contacts/[id]/page.tsx) — انظر DECISIONS.md لتفاصيل الإصلاح الكامل.
 */
export async function importAudienceFromExcel(tenantId: string, file: File): Promise<AudienceImportResult> {
  const parsed = await parseContactsWorkbook(file);
  if (!parsed.success) return { success: false, error: parsed.error };
  if (parsed.rows.length === 0) return { success: false, error: "لا توجد صفوف صالحة في الملف." };

  const tagName = `دفعة استيراد حملة ${new Date().toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}`;
  const tag = await withTenant(tenantId, (tx) => tx.tag.create({ data: { tenantId, name: tagName, isSystem: true } }));

  const { imported, updated } = await importContactsBatch(tenantId, parsed.rows, { forceTagId: tag.id, source: "CAMPAIGN_IMPORT" });

  return { success: true, tagId: tag.id, imported, updated, skipped: parsed.errors.length, errors: parsed.errors };
}
