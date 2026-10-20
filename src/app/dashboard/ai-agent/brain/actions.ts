"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { checkTenantRateLimit } from "@/lib/rateLimit";
import { getTenantChatbotLimits, isNodeTypeAllowed } from "@/lib/planLimits";
import {
  addQa, addTextSource, addUrlSource, backfillQaEmbeddings, BrainError, deleteQa, deleteSource, generateQaFromSource, reprocessSource, updateQa,
} from "@/lib/ai/brain/ingest";
import { invalidateBrainIndex, pickDirectAnswer, searchBrain } from "@/lib/ai/brain/search";

export type BrainActionResult = { ok: boolean; message: string } | null;

const PATH = "/dashboard/ai-agent/brain";

/** صلاحية تعديل الموظف الذكي + بوابة الباقة (نفس بوابة إعدادات الموظف الذكي) على مستوى الخادم. */
async function guard() {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.edit");
  const limits = await getTenantChatbotLimits(session.user.tenantId);
  if (!isNodeTypeAllowed(limits, "ai_reply")) throw new BrainError("عقل البوت متاح مع الموظف الذكي من الباقة الاحترافية فأعلى");
  return { tenantId: session.user.tenantId, userId: session.user.id };
}

/** تنفيذ موحّد: أخطاء التحقق تُعرض للمستخدم، وغيرها رسالة عامة (بلا تسريب تفاصيل داخلية). */
async function run(fn: () => Promise<string>): Promise<BrainActionResult> {
  try {
    const message = await fn();
    revalidatePath(PATH);
    return { ok: true, message };
  } catch (err) {
    unstable_rethrow(err); // توجيه تسجيل الدخول من فحص الجلسة لا يُبتلَع
    if (err instanceof BrainError) return { ok: false, message: err.message };
    console.error("brain action failed:", err);
    return { ok: false, message: "تعذّر تنفيذ العملية — حاول مرة أخرى" };
  }
}

async function ingestLimit(tenantId: string) {
  if (!(await checkTenantRateLimit(tenantId, "brain-ingest", 40, 3600)).allowed) throw new BrainError("إضافات كثيرة خلال ساعة — حاول لاحقاً");
}

export async function addTextKnowledge(_prev: BrainActionResult, formData: FormData): Promise<BrainActionResult> {
  return run(async () => {
    const { tenantId, userId } = await guard();
    await ingestLimit(tenantId);
    const title = String(formData.get("title") ?? "").trim();
    const text = String(formData.get("text") ?? "");
    await addTextSource(tenantId, userId, title, text);
    await writeAuditLog({ tenantId, userId, action: "ai_brain.source_added", targetType: "KnowledgeSource", metaJson: { kind: "TEXT", chars: text.length } });
    return "تمت إضافة المعرفة وفهرستها";
  });
}

export async function addUrlKnowledge(_prev: BrainActionResult, formData: FormData): Promise<BrainActionResult> {
  return run(async () => {
    const { tenantId, userId } = await guard();
    await ingestLimit(tenantId);
    const url = String(formData.get("url") ?? "").trim();
    if (!/^https:\/\/\S+$/i.test(url)) throw new BrainError("أدخل رابطاً يبدأ بـ https://");
    await addUrlSource(tenantId, userId, url);
    await writeAuditLog({ tenantId, userId, action: "ai_brain.source_added", targetType: "KnowledgeSource", metaJson: { kind: "URL", url } });
    return "تم جلب الصفحة وإضافتها للعقل";
  });
}

export async function reprocessKnowledge(sourceId: string): Promise<BrainActionResult> {
  return run(async () => {
    const { tenantId } = await guard();
    await ingestLimit(tenantId);
    await reprocessSource(tenantId, sourceId);
    return "تمت إعادة المعالجة";
  });
}

export async function deleteKnowledge(sourceId: string): Promise<BrainActionResult> {
  return run(async () => {
    const { tenantId, userId } = await guard();
    await deleteSource(tenantId, sourceId);
    await writeAuditLog({ tenantId, userId, action: "ai_brain.source_deleted", targetType: "KnowledgeSource", targetId: sourceId });
    return "تم حذف المصدر";
  });
}

export async function saveQa(_prev: BrainActionResult, formData: FormData): Promise<BrainActionResult> {
  return run(async () => {
    const { tenantId } = await guard();
    const id = String(formData.get("id") ?? "");
    const question = String(formData.get("question") ?? "");
    const answer = String(formData.get("answer") ?? "");
    const directReply = formData.get("directReply") === "on";
    if (id) {
      await updateQa(tenantId, id, { question, answer, directReply });
      return "تم حفظ التعديل";
    }
    await ingestLimit(tenantId);
    await addQa(tenantId, { question, answer, directReply });
    return "تمت إضافة السؤال للعقل";
  });
}

/** سد فجوة معرفة: سؤال حقيقي لم يعرفه البوت + جواب صاحب الحساب ⇒ إجابة معتمدة. */
export async function answerGap(_prev: BrainActionResult, formData: FormData): Promise<BrainActionResult> {
  return run(async () => {
    const { tenantId, userId } = await guard();
    await ingestLimit(tenantId);
    await addQa(tenantId, {
      question: String(formData.get("question") ?? ""),
      answer: String(formData.get("answer") ?? ""),
      origin: "FROM_REVIEW",
      directReply: formData.get("directReply") === "on",
    });
    await writeAuditLog({ tenantId, userId, action: "ai_brain.gap_answered", targetType: "KnowledgeQa" });
    return "سُدّت الفجوة — سيجيب البوت عنها من الآن";
  });
}

/** ✨ استخراج أسئلة وأجوبة من مصدر بالذكاء الاصطناعي ⇒ مقترحات للمراجعة. */
export async function extractQaFromSource(sourceId: string): Promise<BrainActionResult> {
  return run(async () => {
    const { tenantId, userId } = await guard();
    if (!(await checkTenantRateLimit(tenantId, "brain-extract", 10, 3600)).allowed) throw new BrainError("استخراجات كثيرة خلال ساعة — حاول لاحقاً");
    const { created, tokens } = await generateQaFromSource(tenantId, sourceId);
    await writeAuditLog({ tenantId, userId, action: "ai_brain.qa_extracted", targetType: "KnowledgeSource", targetId: sourceId, metaJson: { created, tokens } });
    return created ? `✨ اقتُرح ${created} سؤالاً — راجعها في "إجابات مقترحة" أعلى الصفحة` : "لم نجد أسئلة جديدة في هذا المصدر";
  });
}

export async function deleteQaAction(id: string): Promise<BrainActionResult> {
  return run(async () => {
    const { tenantId } = await guard();
    await deleteQa(tenantId, id);
    return "تم الحذف";
  });
}

/** الموافقة على مقترح من رد الفريق (مع تعديل اختياري للجواب قبل الاعتماد). */
export async function approveSuggestion(_prev: BrainActionResult, formData: FormData): Promise<BrainActionResult> {
  return run(async () => {
    const { tenantId, userId } = await guard();
    const id = String(formData.get("id") ?? "");
    await updateQa(tenantId, id, {
      question: String(formData.get("question") ?? ""),
      answer: String(formData.get("answer") ?? ""),
      directReply: formData.get("directReply") === "on",
    });
    await writeAuditLog({ tenantId, userId, action: "ai_brain.suggestion_approved", targetType: "KnowledgeQa", targetId: id });
    return "تم اعتماد الإجابة — سيستخدمها البوت من الآن";
  });
}

export async function saveBrainSettings(_prev: BrainActionResult, formData: FormData): Promise<BrainActionResult> {
  return run(async () => {
    const { tenantId, userId } = await guard();
    const data = {
      directAnswers: formData.get("directAnswers") === "on",
      rememberCustomers: formData.get("rememberCustomers") === "on",
      learnFromAgents: formData.get("learnFromAgents") === "on",
    };
    await withTenant(tenantId, (tx) => tx.aiAgentConfig.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } }));
    await writeAuditLog({ tenantId, userId, action: "ai_brain.settings_update", targetType: "AiAgentConfig", metaJson: data });
    return "تم حفظ الإعدادات";
  });
}

/** فهرسة الأسئلة المحفوظة قبل ضبط مفتاح الذكاء الاصطناعي (تفعيل البحث الدلالي لها). */
export async function reindexQas(): Promise<BrainActionResult> {
  return run(async () => {
    const { tenantId } = await guard();
    await ingestLimit(tenantId);
    const n = await backfillQaEmbeddings(tenantId);
    invalidateBrainIndex(tenantId);
    return n ? `تمت فهرسة ${n} سؤال` : "كل الأسئلة مفهرسة";
  });
}

export type BrainTestResult =
  | {
      ok: true;
      semantic: boolean;
      direct: { question: string; answer: string; similarity: number } | null;
      qas: Array<{ question: string; answer: string; score: number; similarity: number; directReply: boolean }>;
      chunks: Array<{ sourceTitle: string; content: string; score: number }>;
    }
  | { ok: false; message: string };

/** "اختبر العقل": ماذا سيجد البوت لهذا السؤال — بلا أي رد أو تكلفة نموذج. */
export async function testBrain(query: string): Promise<BrainTestResult> {
  try {
    const { tenantId } = await guard();
    const q = query.trim().slice(0, 500);
    if (q.length < 2) return { ok: false, message: "اكتب سؤالاً" };
    if (!(await checkTenantRateLimit(tenantId, "brain-test", 60, 60)).allowed) return { ok: false, message: "محاولات كثيرة — انتظر دقيقة" };
    const config = await withTenant(tenantId, (tx) => tx.aiAgentConfig.findUnique({ where: { tenantId }, select: { directAnswers: true } }));
    const result = await withTenant(tenantId, (tx) => searchBrain(tx, tenantId, q));
    const direct = (config?.directAnswers ?? true) ? pickDirectAnswer(result, q) : null;
    return {
      ok: true,
      semantic: result.semantic,
      direct: direct ? { question: direct.question, answer: direct.answer, similarity: direct.similarity } : null,
      qas: result.qas.map(({ question, answer, score, similarity, directReply }) => ({ question, answer, score, similarity, directReply })),
      chunks: result.chunks.map(({ sourceTitle, content, score }) => ({ sourceTitle, content: content.slice(0, 400), score })),
    };
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false, message: err instanceof BrainError ? err.message : "تعذّر الاختبار" };
  }
}
