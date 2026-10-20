import { Readable } from "stream";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { getTenantChatbotLimits, isNodeTypeAllowed } from "@/lib/planLimits";
import { addFileSource, BRAIN_LIMITS, BrainError, importQaRows } from "@/lib/ai/brain/ingest";

/**
 * رفع ملفات عقل البوت (مسار API لا Server Action — حد Server Actions 1MB لا يكفي ملفات PDF):
 *  - mode=source: ملف معرفة (PDF / TXT / MD / CSV) يُقسَّم ويُفهرَس.
 *  - mode=qa: أسئلة وأجوبة بالجملة من Excel/CSV (العمود الأول السؤال، الثاني الجواب).
 */
export async function POST(req: Request) {
  const session = await requireTenantSession();
  if (!hasEffectivePermission(session.user.permissions, "chatbot.edit")) return NextResponse.json({ ok: false, message: "لا تملك صلاحية تعديل الموظف الذكي" }, { status: 403 });
  const tenantId = session.user.tenantId;
  if (!isNodeTypeAllowed(await getTenantChatbotLimits(tenantId), "ai_reply")) {
    return NextResponse.json({ ok: false, message: "عقل البوت متاح من الباقة الاحترافية فأعلى" }, { status: 403 });
  }
  if (!(await checkTenantRateLimit(tenantId, "brain-ingest", 40, 3600)).allowed) {
    return NextResponse.json({ ok: false, message: "إضافات كثيرة خلال ساعة — حاول لاحقاً" }, { status: 429 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > BRAIN_LIMITS.maxFileBytes + 64 * 1024) {
    return NextResponse.json({ ok: false, message: "الملف أكبر من 10MB" }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const mode = String(form?.get("mode") ?? "source");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, message: "اختر ملفاً" }, { status: 400 });
  if (file.size > BRAIN_LIMITS.maxFileBytes) return NextResponse.json({ ok: false, message: "الملف أكبر من 10MB" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    if (mode === "qa") {
      const rows = await readQaRows(file.name, bytes);
      if (!rows.length) throw new BrainError("لم نجد صفوفاً — العمود الأول السؤال والثاني الجواب");
      if (rows.length > 500) throw new BrainError("الحد الأقصى 500 سؤال في الملف الواحد");
      const r = await importQaRows(tenantId, rows);
      await writeAuditLog({ tenantId, userId: session.user.id, action: "ai_brain.qa_imported", targetType: "KnowledgeQa", metaJson: { added: r.added, updated: r.updated } });
      const extra = r.errors.length ? ` — تُخطّي ${r.errors.length} صف: ${r.errors.slice(0, 3).join("، ")}` : "";
      return NextResponse.json({ ok: true, message: `أُضيف ${r.added} سؤال وحُدِّث ${r.updated}${extra}` });
    }
    await addFileSource(tenantId, session.user.id, file.name.slice(0, 150), bytes);
    await writeAuditLog({ tenantId, userId: session.user.id, action: "ai_brain.source_added", targetType: "KnowledgeSource", metaJson: { kind: "FILE", name: file.name, bytes: file.size } });
    return NextResponse.json({ ok: true, message: "تمت إضافة الملف وفهرسته" });
  } catch (err) {
    if (err instanceof BrainError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    console.error("brain upload failed:", err);
    return NextResponse.json({ ok: false, message: "تعذّر معالجة الملف" }, { status: 500 });
  }
}

const HEADER = /^(السؤال|سؤال|question|q)$/i;

async function readQaRows(name: string, bytes: Uint8Array): Promise<Array<{ question: string; answer: string }>> {
  const lower = name.toLowerCase();
  if (!/\.(xlsx|csv)$/.test(lower)) throw new BrainError("ملف الأسئلة يجب أن يكون xlsx أو csv");
  const workbook = new ExcelJS.Workbook();
  try {
    if (lower.endsWith(".csv")) await workbook.csv.read(Readable.from(Buffer.from(bytes)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- نوع Buffer الخاص بـexceljs (نفس bulkImport.ts)
    else await workbook.xlsx.load(Buffer.from(bytes) as any);
  } catch {
    throw new BrainError("تعذّر قراءة الملف — تأكد أنه Excel/CSV صالح");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: Array<{ question: string; answer: string }> = [];
  sheet.eachRow({ includeEmpty: false }, (row, n) => {
    const cell = (i: number) => {
      const v = row.getCell(i).value as unknown;
      if (v && typeof v === "object" && "richText" in v) return (v as { richText: Array<{ text: string }> }).richText.map((t) => t.text).join("");
      if (v && typeof v === "object" && "text" in v) return String((v as { text: unknown }).text);
      return String(v ?? "");
    };
    const question = cell(1).trim();
    const answer = cell(2).trim();
    if (n === 1 && HEADER.test(question)) return;
    if (!question && !answer) return;
    rows.push({ question, answer });
  });
  return rows;
}
