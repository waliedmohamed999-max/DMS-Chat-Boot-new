import { Readable } from "stream";
import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import type { ContactSource } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { redisConnection } from "@/lib/queue/connection";
import { SAUDI_PHONE_PATTERN } from "@/lib/contacts/phone";

/** حد أقصى صارم لعدد الصفوف لكل ملف — يمنع استنزاف قاعدة البيانات بكتابات ضخمة من ملف واحد. */
export const MAX_IMPORT_ROWS = 2000;
/** حد أقصى لحجم الملف بالبايت (5MB) — تحقق صريح إضافي، بالتوازي مع حد Next.js Server Actions العام. */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];
/** مدة صلاحية جلسة معاينة الاستيراد قبل التأكيد النهائي — بعدها يجب رفع الملف مجدداً. */
const PREVIEW_SESSION_TTL_SECONDS = 15 * 60;

export type ImportRow = { name: string; phoneE164: string; email: string | null; tagNames: string[] };
export type ImportRowError = { row: number; reason: string };

export type ParseResult =
  | { success: true; rows: ImportRow[]; errors: ImportRowError[]; totalRows: number }
  | { success: false; error: string };

/** يطبّع الصيغ الشائعة لرقم جوال سعودي (مسافات/شرطات/بادئة 0 أو 966) إلى +9665XXXXXXXX قبل التحقق النهائي. */
function normalizeSaudiPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+9665\d{8}$/.test(digits)) return digits;
  if (/^9665\d{8}$/.test(digits)) return `+${digits}`;
  if (/^05\d{8}$/.test(digits)) return `+966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `+966${digits}`;
  return digits;
}

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `حجم الملف كبير جداً (الحد الأقصى ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} ميجابايت).`;
  }
  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!hasAllowedExtension) {
    return "امتداد الملف غير مدعوم — استخدم xlsx أو xls أو csv فقط.";
  }
  return null;
}

/** يحلّل ملف Excel/CSV مرفوع فعلياً (كل التحقق هنا على المحتوى الخام، لا يُوثَق بأي بيانات من العميل). */
export async function parseContactsWorkbook(file: File): Promise<ParseResult> {
  const fileError = validateFile(file);
  if (fileError) return { success: false, error: fileError };

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  const isCsv = file.name.toLowerCase().endsWith(".csv");

  try {
    if (isCsv) {
      await workbook.csv.read(Readable.from(buffer));
    } else {
      // exceljs يعلن واجهة Buffer عامة خاصة به (تتعارض بنيوياً مع Buffer الحقيقي من @types/node) —
      // تعارض نوعي بحت فقط، لا يؤثر على التشغيل الفعلي إطلاقاً (Buffer حقيقي وصالح وقت التنفيذ).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(buffer as any);
    }
  } catch {
    return { success: false, error: "تعذّر قراءة الملف — تأكد أنه ملف Excel/CSV صالح وغير تالف." };
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { success: false, error: "الملف لا يحتوي على أي ورقة بيانات." };

  // الصف الأول عنوان الأعمدة (الاسم | الجوال | البريد الإلكتروني | الوسوم) — يُتجاهَل دائماً.
  const dataRowCount = worksheet.rowCount - 1;
  if (dataRowCount > MAX_IMPORT_ROWS) {
    return { success: false, error: `عدد الصفوف (${dataRowCount}) يتجاوز الحد الأقصى المسموح (${MAX_IMPORT_ROWS} صف لكل ملف).` };
  }

  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  let totalRows = 0;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // صف العناوين
    totalRows++;

    const name = String(row.getCell(1).value ?? "").trim();
    const rawPhone = String(row.getCell(2).value ?? "").trim();
    const rawEmail = String(row.getCell(3).value ?? "").trim();
    const rawTags = String(row.getCell(4).value ?? "").trim();

    if (!name && !rawPhone) return; // صف فارغ تماماً — يُتجاهَل بصمت (ليس خطأ)

    if (name.length < 2) {
      errors.push({ row: rowNumber, reason: "الاسم قصير جداً أو مفقود" });
      return;
    }
    const normalizedPhone = normalizeSaudiPhone(rawPhone);
    if (!SAUDI_PHONE_PATTERN.test(normalizedPhone)) {
      errors.push({ row: rowNumber, reason: `رقم جوال غير صالح: "${rawPhone}"` });
      return;
    }
    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      errors.push({ row: rowNumber, reason: `بريد إلكتروني غير صالح: "${rawEmail}"` });
      return;
    }

    const tagNames = rawTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10); // حد معقول لعدد الوسوم لكل صف

    rows.push({ name, phoneE164: normalizedPhone, email: rawEmail || null, tagNames });
  });

  return { success: true, rows, errors, totalRows };
}

export type DuplicateStrategy = "skip" | "update";

type PreviewSession = {
  tenantId: string;
  fileName: string;
  rows: ImportRow[];
  errors: ImportRowError[];
  totalRows: number;
};

export type ImportPreviewResult =
  | {
      success: true;
      sessionId: string;
      totalRows: number;
      validRowsCount: number;
      duplicateCount: number;
      previewRows: (ImportRow & { isDuplicate: boolean })[];
      errors: ImportRowError[];
    }
  | { success: false; error: string };

const PREVIEW_ROWS_SHOWN = 10;

/**
 * يحلّل الملف ويحفظ الصفوف الصالحة مؤقتاً في Redis (بلا أي كتابة على القاعدة بعد) — يتيح عرض معاينة
 * حقيقية (أول 10 صفوف + عدد التكرارات المكتشَفة مقابل أرقام موجودة فعلاً) قبل التأكيد النهائي (بند 3
 * في البرومنت). الجلسة تنتهي صلاحيتها تلقائياً خلال 15 دقيقة عبر TTL في Redis إن لم يُؤكَّد الاستيراد.
 */
export async function parseAndPreviewImport(tenantId: string, file: File): Promise<ImportPreviewResult> {
  const parsed = await parseContactsWorkbook(file);
  if (!parsed.success) return { success: false, error: parsed.error };
  if (parsed.rows.length === 0) return { success: false, error: "لا توجد صفوف صالحة في الملف." };

  const phones = parsed.rows.map((r) => r.phoneE164);
  const existing = await withTenant(tenantId, (tx) =>
    tx.contact.findMany({ where: { tenantId, phoneE164: { in: phones } }, select: { phoneE164: true } })
  );
  const existingPhones = new Set(existing.map((c) => c.phoneE164));
  const rowsWithDup = parsed.rows.map((r) => ({ ...r, isDuplicate: existingPhones.has(r.phoneE164) }));

  const sessionId = randomUUID();
  const session: PreviewSession = {
    tenantId,
    fileName: file.name,
    rows: parsed.rows,
    errors: parsed.errors,
    totalRows: parsed.totalRows,
  };
  await redisConnection.set(`contact-import-session:${sessionId}`, JSON.stringify(session), "EX", PREVIEW_SESSION_TTL_SECONDS);

  return {
    success: true,
    sessionId,
    totalRows: parsed.totalRows,
    validRowsCount: parsed.rows.length,
    duplicateCount: rowsWithDup.filter((r) => r.isDuplicate).length,
    previewRows: rowsWithDup.slice(0, PREVIEW_ROWS_SHOWN),
    errors: parsed.errors,
  };
}

export type ImportBatchOptions = {
  /** افتراضي "update" — يطابق سلوك الاستيراد المباشر القديم (upsert). */
  duplicateStrategy?: DuplicateStrategy;
  forceTagId?: string;
  source?: ContactSource;
};

export type ImportBatchResult = { imported: number; updated: number; skipped: number; newContactIds: string[] };

/**
 * يكتب دفعة الصفوف الصحيحة فعلياً في القاعدة. `duplicateStrategy: "skip"` يتجاهل أي رقم موجود مسبقاً
 * تماماً (لا يُعدَّل)؛ `"update"` يحدّث الاسم/البريد للجهة الموجودة (نفس السلوك القديم). `newContactIds`
 * تُعيد فقط معرّفات الجهات **الجديدة فعلياً** بهذه الدفعة (وليس المُحدَّثة) — أساس ميزة التراجع عن
 * الاستيراد لاحقاً، حيث لا يجوز حذف جهة كانت موجودة مسبقاً لمجرد ظهورها في دفعة استيراد.
 */
export async function importContactsBatch(
  tenantId: string,
  rows: ImportRow[],
  options: ImportBatchOptions = {}
): Promise<ImportBatchResult> {
  const { duplicateStrategy = "update", forceTagId, source = "IMPORT" } = options;
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const newContactIds: string[] = [];

  await withTenant(tenantId, async (tx) => {
    const tagIdCache = new Map<string, string>();

    async function resolveTagId(name: string): Promise<string> {
      const cached = tagIdCache.get(name);
      if (cached) return cached;
      const tag = await tx.tag.upsert({
        where: { tenantId_name: { tenantId, name } },
        update: {},
        create: { tenantId, name },
      });
      tagIdCache.set(name, tag.id);
      return tag.id;
    }

    for (const row of rows) {
      const existing = await tx.contact.findUnique({ where: { tenantId_phoneE164: { tenantId, phoneE164: row.phoneE164 } } });

      if (existing && duplicateStrategy === "skip") {
        skipped++;
        continue;
      }

      const contact = await tx.contact.upsert({
        where: { tenantId_phoneE164: { tenantId, phoneE164: row.phoneE164 } },
        update: { name: row.name, email: row.email },
        create: { tenantId, name: row.name, phoneE164: row.phoneE164, email: row.email, source },
      });
      if (existing) {
        updated++;
      } else {
        imported++;
        newContactIds.push(contact.id);
      }

      const tagIds = new Set<string>();
      for (const tagName of row.tagNames) tagIds.add(await resolveTagId(tagName));
      if (forceTagId) tagIds.add(forceTagId);

      for (const tagId of tagIds) {
        await tx.contactTag.upsert({
          where: { contactId_tagId: { contactId: contact.id, tagId } },
          update: {},
          create: { contactId: contact.id, tagId },
        });
      }
    }
  });

  return { imported, updated, skipped, newContactIds };
}

export type CommitImportResult =
  | { success: true; batchId: string; imported: number; updated: number; skipped: number; errors: ImportRowError[] }
  | { success: false; error: string };

/**
 * يقرأ جلسة معاينة سابقة من Redis وينفّذ الكتابة الفعلية حسب استراتيجية التكرار المختارة، ثم ينشئ
 * سجل دفعة استيراد حقيقياً (ContactImportBatch) لتتبّعها لاحقاً في تبويب "استيراد ملفات" وإتاحة
 * التراجع (Undo) عنها، ويربط كل جهة اتصال **جديدة** بهذه الدفعة عبر importBatchId. تُحذَف جلسة
 * Redis فوراً بعد الالتزام لمنع إعادة استخدامها مرتين.
 */
export async function commitContactImport(
  tenantId: string,
  userId: string,
  sessionId: string,
  duplicateStrategy: DuplicateStrategy,
  source: Extract<ContactSource, "IMPORT" | "CAMPAIGN_IMPORT"> = "IMPORT",
  forceTagId?: string
): Promise<CommitImportResult> {
  const raw = await redisConnection.get(`contact-import-session:${sessionId}`);
  if (!raw) return { success: false, error: "انتهت صلاحية جلسة المعاينة (15 دقيقة) — ارفع الملف مرة أخرى." };

  const session = JSON.parse(raw) as PreviewSession;
  if (session.tenantId !== tenantId) {
    return { success: false, error: "جلسة استيراد غير صالحة." };
  }

  const { imported, updated, skipped, newContactIds } = await importContactsBatch(tenantId, session.rows, {
    duplicateStrategy,
    forceTagId,
    source,
  });
  const totalSkipped = skipped + session.errors.length;

  const batch = await withTenant(tenantId, (tx) =>
    tx.contactImportBatch.create({
      data: {
        tenantId,
        source,
        fileName: session.fileName,
        totalRows: session.totalRows,
        importedCount: imported,
        updatedCount: updated,
        skippedCount: totalSkipped,
        errorsJson: session.errors as never,
        createdByUserId: userId,
      },
    })
  );

  if (newContactIds.length > 0) {
    await withTenant(tenantId, (tx) =>
      tx.contact.updateMany({ where: { tenantId, id: { in: newContactIds } }, data: { importBatchId: batch.id } })
    );
  }

  await redisConnection.del(`contact-import-session:${sessionId}`);

  return { success: true, batchId: batch.id, imported, updated, skipped: totalSkipped, errors: session.errors };
}
