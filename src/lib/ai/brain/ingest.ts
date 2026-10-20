import crypto from "crypto";
import type { KnowledgeQaOrigin, KnowledgeQaStatus, Prisma } from "@prisma/client";
import { superAdminDb, withTenant } from "@/lib/db";
import { getOpenAiClient } from "@/lib/ai/openaiClient";
import { fetchPageWithSsrfProtection } from "@/lib/chatbot/safeFetch";
import { embedTexts, packVector } from "./embeddings";
import { invalidateBrainIndex } from "./search";
import { chunkText, htmlToText } from "./text";

/** حدود المعرفة لكل حساب — تحمي الذاكرة وزمن البحث وتكلفة المتجهات. */
export const BRAIN_LIMITS = {
  maxSources: 100,
  maxTotalChars: 400_000,
  maxSourceChars: 150_000,
  maxQas: 1000,
  maxFileBytes: 10 * 1024 * 1024,
  maxUrlBytes: 3 * 1024 * 1024,
};

export class BrainError extends Error {}

export async function brainUsage(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [sources, chars, qas] = await Promise.all([
      tx.knowledgeSource.count({ where: { tenantId } }),
      tx.knowledgeSource.aggregate({ where: { tenantId }, _sum: { charCount: true } }),
      tx.knowledgeQa.count({ where: { tenantId } }),
    ]);
    return { sources, chars: chars._sum.charCount ?? 0, qas };
  });
}

async function assertCapacity(tenantId: string, addChars: number, replacingSourceId?: string) {
  const usage = await brainUsage(tenantId);
  if (!replacingSourceId && usage.sources >= BRAIN_LIMITS.maxSources) throw new BrainError(`وصلت للحد الأقصى (${BRAIN_LIMITS.maxSources} مصدر) — احذف مصادر قديمة أولاً`);
  let current = usage.chars;
  if (replacingSourceId) {
    const old = await withTenant(tenantId, (tx) => tx.knowledgeSource.findUnique({ where: { id: replacingSourceId }, select: { charCount: true } }));
    current -= old?.charCount ?? 0;
  }
  if (current + addChars > BRAIN_LIMITS.maxTotalChars) {
    throw new BrainError(`حجم المعرفة سيتجاوز الحد (${BRAIN_LIMITS.maxTotalChars.toLocaleString("en")} حرف) — اختصر المحتوى أو احذف مصادر`);
  }
}

/**
 * يقسّم النص ويحسب متجهات المقاطع ثم يستبدل مقاطع المصدر بالكامل (ذرياً). فشل المتجهات ليس فشلاً للمصدر:
 * يُحفظ بلا متجهات ويعمل بالكلمات المفتاحية، مع تنبيه في error.
 */
async function indexSource(tenantId: string, sourceId: string, text: string) {
  const chunks = chunkText(text);
  if (!chunks.length) throw new BrainError("لا يوجد نص قابل للاستخدام في هذا المصدر");
  let vectors: Float32Array[] | null = null;
  let warning: string | null = null;
  try {
    vectors = (await embedTexts(chunks))?.vectors ?? null;
    if (!vectors) warning = "بلا بحث دلالي — لم يُضبط مفتاح الذكاء الاصطناعي بعد (يعمل البحث بالكلمات)";
  } catch (err) {
    warning = `تعذّر حساب المتجهات (${err instanceof Error ? err.message.slice(0, 120) : "خطأ"}) — يعمل البحث بالكلمات`;
  }
  await withTenant(tenantId, async (tx) => {
    await tx.knowledgeChunk.deleteMany({ where: { sourceId } });
    await tx.knowledgeChunk.createMany({
      data: chunks.map((content, position) => ({
        tenantId, sourceId, position, content, embedding: vectors?.[position] ? packVector(vectors[position]!) : null,
      })),
    });
    await tx.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: "READY", error: warning, charCount: text.length, chunkCount: chunks.length, contentHash: hashText(text), refreshedAt: new Date() },
    });
  });
  invalidateBrainIndex(tenantId);
}

const hashText = (text: string) => crypto.createHash("sha256").update(text.trim()).digest("hex");

async function createAndIndex(
  tenantId: string,
  data: { kind: "TEXT" | "URL" | "FILE"; title: string; sourceUrl?: string | null; createdById?: string | null },
  text: string
) {
  const clean = text.trim();
  if (clean.length < 20) throw new BrainError("المحتوى قصير جداً (أقل من 20 حرفاً)");
  if (clean.length > BRAIN_LIMITS.maxSourceChars) throw new BrainError(`المصدر أكبر من ${BRAIN_LIMITS.maxSourceChars.toLocaleString("en")} حرف — قسّمه لأكثر من مصدر`);
  await assertCapacity(tenantId, clean.length);
  const source = await withTenant(tenantId, (tx) =>
    tx.knowledgeSource.create({ data: { tenantId, ...data, title: data.title.slice(0, 200), charCount: clean.length } })
  );
  try {
    await indexSource(tenantId, source.id, clean);
  } catch (err) {
    await markFailed(tenantId, source.id, err);
    throw err;
  }
  return source.id;
}

async function markFailed(tenantId: string, sourceId: string, err: unknown) {
  await withTenant(tenantId, (tx) =>
    tx.knowledgeSource.update({ where: { id: sourceId }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "فشل" } })
  ).catch(() => {});
  invalidateBrainIndex(tenantId);
}

export async function addTextSource(tenantId: string, userId: string, title: string, text: string) {
  return createAndIndex(tenantId, { kind: "TEXT", title: title || text.slice(0, 60), createdById: userId }, text);
}

/** جلب صفحة ويب (محمي من SSRF مع تثبيت العنوان، حجم أقصى، HTML/نص فقط). */
export async function fetchUrlText(rawUrl: string): Promise<{ title: string | null; text: string }> {
  const res = await fetchPageWithSsrfProtection(rawUrl.trim(), BRAIN_LIMITS.maxUrlBytes);
  if (!res.success) throw new BrainError(`تعذّر فتح الرابط: ${res.error}`);
  if (res.status !== 200) throw new BrainError(`الموقع ردّ بالحالة ${res.status}`);
  if (!/text\/html|text\/plain|application\/xhtml/.test(res.contentType)) throw new BrainError("الرابط ليس صفحة نصية (HTML أو نص)");
  const body = res.buffer.toString("utf8");
  return res.contentType.includes("text/plain") ? { title: null, text: body } : htmlToText(body);
}

export async function addUrlSource(tenantId: string, userId: string, url: string) {
  const { title, text } = await fetchUrlText(url);
  return createAndIndex(tenantId, { kind: "URL", title: title || new URL(url).hostname, sourceUrl: url, createdById: userId }, text);
}

/** نص ملف مرفوع: PDF، أو نص/Markdown/CSV. */
export async function extractFileText(name: string, bytes: Uint8Array): Promise<string> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes).catch(() => {
      throw new BrainError("ملف PDF تالف أو محمي بكلمة مرور");
    });
    const { text } = await extractText(pdf, { mergePages: true });
    const value = Array.isArray(text) ? text.join("\n\n") : text;
    if (!value.trim()) throw new BrainError("ملف PDF بلا نص قابل للقراءة (صور ممسوحة ضوئياً) — انسخ النص والصقه بدلاً منه");
    return value;
  }
  if (/\.(txt|md|csv|tsv|json)$/.test(lower)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (text.includes("\u0000")) throw new BrainError("الملف ليس نصياً");
    return text;
  }
  throw new BrainError("نوع ملف غير مدعوم — المدعوم: PDF، TXT، MD، CSV");
}

export async function addFileSource(tenantId: string, userId: string, name: string, bytes: Uint8Array) {
  if (bytes.byteLength > BRAIN_LIMITS.maxFileBytes) throw new BrainError("الملف أكبر من 10MB");
  const text = await extractFileText(name, bytes);
  return createAndIndex(tenantId, { kind: "FILE", title: name.replace(/\.[^.]+$/, ""), createdById: userId }, text);
}

/** إعادة جلب رابط أو إعادة حساب متجهات مصدر (بعد ضبط مفتاح الذكاء الاصطناعي مثلاً). */
export async function reprocessSource(tenantId: string, sourceId: string) {
  const source = await withTenant(tenantId, (tx) =>
    tx.knowledgeSource.findUnique({ where: { id: sourceId }, include: { chunks: { orderBy: { position: "asc" }, select: { content: true } } } })
  );
  if (!source) throw new BrainError("المصدر غير موجود");
  let text: string;
  if (source.kind === "URL" && source.sourceUrl) {
    text = (await fetchUrlText(source.sourceUrl)).text;
  } else {
    // نص المصدر الأصلي = مقاطعه بلا التداخل (التداخل يتكرر بلا ضرر عند إعادة التقسيم).
    text = source.chunks.map((c) => c.content).join("\n\n");
  }
  if (!text.trim()) throw new BrainError("لا يوجد نص لإعادة المعالجة");
  await assertCapacity(tenantId, text.length, sourceId);
  await withTenant(tenantId, (tx) => tx.knowledgeSource.update({ where: { id: sourceId }, data: { status: "PROCESSING", error: null } }));
  try {
    await indexSource(tenantId, sourceId, text);
  } catch (err) {
    await markFailed(tenantId, sourceId, err);
    throw err;
  }
}

export async function deleteSource(tenantId: string, sourceId: string) {
  await withTenant(tenantId, (tx) => tx.knowledgeSource.delete({ where: { id: sourceId } }));
  invalidateBrainIndex(tenantId);
}

// ========================= الأسئلة والأجوبة =========================

async function embedQuestion(question: string): Promise<Buffer | null> {
  try {
    const r = await embedTexts([question]);
    return r?.vectors[0] ? packVector(r.vectors[0]) : null;
  } catch {
    return null;
  }
}

export function validateQa(question: string, answer: string) {
  const q = question.trim();
  const a = answer.trim();
  if (q.length < 3 || q.length > 500) throw new BrainError("السؤال بين 3 و500 حرف");
  if (a.length < 1 || a.length > 2000) throw new BrainError("الجواب بين 1 و2000 حرف");
  return { q, a };
}

export async function addQa(
  tenantId: string,
  input: { question: string; answer: string; origin?: KnowledgeQaOrigin; status?: KnowledgeQaStatus; directReply?: boolean },
  db?: Prisma.TransactionClient
) {
  const { q, a } = validateQa(input.question, input.answer);
  const run = async (tx: Prisma.TransactionClient) => {
    if ((await tx.knowledgeQa.count({ where: { tenantId } })) >= BRAIN_LIMITS.maxQas) throw new BrainError(`وصلت للحد الأقصى (${BRAIN_LIMITS.maxQas} سؤال)`);
    const dup = await tx.knowledgeQa.findFirst({ where: { tenantId, question: q }, select: { id: true } });
    if (dup) {
      return tx.knowledgeQa.update({
        where: { id: dup.id },
        data: { answer: a, status: input.status ?? "ACTIVE", ...(input.directReply === undefined ? {} : { directReply: input.directReply }) },
      });
    }
    return tx.knowledgeQa.create({
      data: { tenantId, question: q, answer: a, origin: input.origin ?? "MANUAL", status: input.status ?? "ACTIVE", directReply: input.directReply ?? true },
    });
  };
  const qa = db ? await run(db) : await withTenant(tenantId, run);
  // المتجه بعد الحفظ (خارج المعاملة — استدعاء شبكة).
  const embedding = await embedQuestion(q);
  if (embedding) {
    if (db) await db.knowledgeQa.update({ where: { id: qa.id }, data: { embedding } });
    else await withTenant(tenantId, (tx) => tx.knowledgeQa.update({ where: { id: qa.id }, data: { embedding } }));
  }
  invalidateBrainIndex(tenantId);
  return qa;
}

export async function updateQa(tenantId: string, id: string, input: { question: string; answer: string; directReply: boolean }) {
  const { q, a } = validateQa(input.question, input.answer);
  const existing = await withTenant(tenantId, (tx) => tx.knowledgeQa.findUnique({ where: { id } }));
  if (!existing) throw new BrainError("السؤال غير موجود");
  const embedding = existing.question !== q || !existing.embedding ? await embedQuestion(q) : existing.embedding;
  await withTenant(tenantId, (tx) =>
    tx.knowledgeQa.update({ where: { id }, data: { question: q, answer: a, directReply: input.directReply, embedding, status: "ACTIVE" } })
  );
  invalidateBrainIndex(tenantId);
}

export async function deleteQa(tenantId: string, id: string) {
  await withTenant(tenantId, (tx) => tx.knowledgeQa.delete({ where: { id } }));
  invalidateBrainIndex(tenantId);
}

/**
 * استيراد أسئلة وأجوبة بالجملة (Excel/CSV): تحقق صف بصف، حفظ في معاملة واحدة، ثم متجهات الأسئلة دفعةً واحدة
 * (استدعاء متجهات واحد لكل ~100 سؤال بدل استدعاء لكل سؤال).
 */
export async function importQaRows(tenantId: string, rows: Array<{ question: string; answer: string }>) {
  const valid: Array<{ q: string; a: string }> = [];
  const errors: string[] = [];
  rows.forEach((r, i) => {
    try {
      valid.push(validateQa(r.question, r.answer));
    } catch (err) {
      errors.push(`صف ${i + 2}: ${err instanceof Error ? err.message : "غير صالح"}`);
    }
  });
  const unique = [...new Map(valid.map((v) => [v.q, v])).values()];
  const saved = await withTenant(tenantId, async (tx) => {
    const count = await tx.knowledgeQa.count({ where: { tenantId } });
    const existing = new Map(
      (await tx.knowledgeQa.findMany({ where: { tenantId, question: { in: unique.map((u) => u.q) } }, select: { id: true, question: true } })).map((e) => [e.question, e.id])
    );
    const newOnes = unique.filter((u) => !existing.has(u.q));
    if (count + newOnes.length > BRAIN_LIMITS.maxQas) throw new BrainError(`الاستيراد سيتجاوز الحد الأقصى (${BRAIN_LIMITS.maxQas} سؤال)`);
    const ids: Array<{ id: string; q: string }> = [];
    for (const u of unique) {
      const id = existing.get(u.q);
      if (id) {
        await tx.knowledgeQa.update({ where: { id }, data: { answer: u.a, status: "ACTIVE" } });
        ids.push({ id, q: u.q });
      } else {
        const qa = await tx.knowledgeQa.create({ data: { tenantId, question: u.q, answer: u.a, origin: "MANUAL" } });
        ids.push({ id: qa.id, q: u.q });
      }
    }
    return { ids, added: newOnes.length, updated: unique.length - newOnes.length };
  });
  try {
    const r = await embedTexts(saved.ids.map((x) => x.q));
    if (r) {
      await withTenant(tenantId, async (tx) => {
        for (let i = 0; i < saved.ids.length; i++) {
          const v = r.vectors[i];
          if (v) await tx.knowledgeQa.update({ where: { id: saved.ids[i]!.id }, data: { embedding: packVector(v) } });
        }
      });
    }
  } catch (err) {
    console.error("⚠️ تعذّر فهرسة الأسئلة المستوردة (تعمل بالكلمات):", err instanceof Error ? err.message : err);
  }
  invalidateBrainIndex(tenantId);
  return { added: saved.added, updated: saved.updated, errors };
}

/** نقل الأسئلة الشائعة القديمة (AiAgentConfig.faqItems) إلى العقل مرة واحدة ثم تفريغها. */
export async function importLegacyFaq(tenantId: string) {
  const config = await withTenant(tenantId, (tx) => tx.aiAgentConfig.findUnique({ where: { tenantId }, select: { faqItems: true } }));
  const items = Array.isArray(config?.faqItems) ? (config!.faqItems as Array<{ question?: string; answer?: string }>) : [];
  if (!items.length) return 0;
  let imported = 0;
  for (const item of items) {
    if (!item.question?.trim() || !item.answer?.trim()) continue;
    try {
      await addQa(tenantId, { question: item.question, answer: item.answer, origin: "IMPORTED_FAQ" });
      imported++;
    } catch {
      // سؤال غير صالح/الحد الأقصى — يُتخطى
    }
  }
  await withTenant(tenantId, (tx) => tx.aiAgentConfig.update({ where: { tenantId }, data: { faqItems: [] } }));
  return imported;
}

/** إعادة حساب متجهات كل الأسئلة بلا متجه (بعد ضبط مفتاح الذكاء الاصطناعي لاحقاً). */
export async function backfillQaEmbeddings(tenantId: string): Promise<number> {
  const missing = await withTenant(tenantId, (tx) => tx.knowledgeQa.findMany({ where: { tenantId, embedding: null }, select: { id: true, question: true }, take: 500 }));
  if (!missing.length) return 0;
  const r = await embedTexts(missing.map((m) => m.question));
  if (!r) return 0;
  await withTenant(tenantId, async (tx) => {
    for (let i = 0; i < missing.length; i++) {
      const v = r.vectors[i];
      if (v) await tx.knowledgeQa.update({ where: { id: missing[i]!.id }, data: { embedding: packVector(v) } });
    }
  });
  invalidateBrainIndex(tenantId);
  return missing.length;
}

// ========================= التحديث الدوري للروابط =========================

const REFRESH_AFTER_MS = 7 * 24 * 3600 * 1000;

/**
 * يعيد جلب صفحات الروابط أسبوعياً حتى تبقى معرفة البوت مطابقة لموقع التاجر (أسعار/سياسات تتغيّر). المحتوى
 * غير المتغيّر (نفس البصمة) لا يُعاد فهرسته — لا تكلفة متجهات. فشل الجلب يُسجَّل على المصدر ولا يحذف معرفته.
 */
export async function refreshStaleUrlSources(limit = 30): Promise<{ checked: number; updated: number; unchanged: number; failed: number }> {
  const due = await superAdminDb.knowledgeSource.findMany({
    where: { kind: "URL", status: { in: ["READY", "FAILED"] }, OR: [{ refreshedAt: null }, { refreshedAt: { lt: new Date(Date.now() - REFRESH_AFTER_MS) } }] },
    orderBy: { refreshedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true, tenantId: true, sourceUrl: true, contentHash: true },
  });
  const r = { checked: due.length, updated: 0, unchanged: 0, failed: 0 };
  for (const src of due) {
    try {
      const { text } = await fetchUrlText(src.sourceUrl!);
      const clean = text.trim();
      if (src.contentHash && hashText(clean) === src.contentHash) {
        await superAdminDb.knowledgeSource.update({ where: { id: src.id }, data: { refreshedAt: new Date(), status: "READY", error: null } });
        r.unchanged++;
        continue;
      }
      if (clean.length > BRAIN_LIMITS.maxSourceChars) throw new BrainError("الصفحة صارت أكبر من الحد المسموح");
      await assertCapacity(src.tenantId, clean.length, src.id);
      await indexSource(src.tenantId, src.id, clean);
      r.updated++;
    } catch (err) {
      r.failed++;
      // تبقى المعرفة السابقة صالحة؛ يُسجَّل الخطأ وموعد المحاولة حتى لا يُعاد كل دورة.
      await superAdminDb.knowledgeSource.update({
        where: { id: src.id },
        data: { refreshedAt: new Date(), error: `تعذّر التحديث التلقائي: ${err instanceof Error ? err.message.slice(0, 200) : "خطأ"}` },
      }).catch(() => {});
    }
  }
  return r;
}

// ========================= استخراج أسئلة وأجوبة بالذكاء الاصطناعي =========================

const EXTRACT_MAX_CHARS = 12_000;
const EXTRACT_MAX_ITEMS = 15;

/**
 * يقرأ الذكاء الاصطناعي مصدر معرفة ويقترح أهم الأسئلة التي سيسألها العملاء مع أجوبتها من النص نفسه فقط.
 * تُحفظ مقترحات (PENDING) يراجعها صاحب الحساب — ثم تصبح ردوداً مباشرة بلا توكنز. يُحتسب من حصة التوكنز.
 */
export async function generateQaFromSource(tenantId: string, sourceId: string): Promise<{ created: number; tokens: number }> {
  const openai = await getOpenAiClient();
  if (!openai) throw new BrainError("اضبط مفتاح الذكاء الاصطناعي أولاً (من مدير المنصة)");
  const source = await withTenant(tenantId, (tx) =>
    tx.knowledgeSource.findUnique({ where: { id: sourceId }, include: { chunks: { orderBy: { position: "asc" }, select: { content: true } } } })
  );
  if (!source || source.status !== "READY") throw new BrainError("المصدر غير جاهز");
  const quota = await withTenant(tenantId, async (tx) => {
    const sub = await tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    const max = (sub?.plan.chatbotLimitsJson as { maxAiTokensPerMonth?: number } | null)?.maxAiTokensPerMonth ?? 0;
    return !sub || max < 0 || sub.aiTokensUsedThisPeriod < max;
  });
  if (!quota) throw new BrainError("استُهلكت حصة توكنز الذكاء الاصطناعي لهذا الشهر");

  const text = source.chunks.map((c) => c.content).join("\n\n").slice(0, EXTRACT_MAX_CHARS);
  const completion = await openai.client.chat.completions.create({
    model: openai.model,
    response_format: { type: "json_object" },
    max_completion_tokens: 2500,
    messages: [
      {
        role: "system",
        content: `أنت تُعدّ قاعدة أسئلة شائعة لخدمة عملاء متجر. من النص المعطى فقط، استخرج حتى ${EXTRACT_MAX_ITEMS} سؤالاً يُرجَّح أن يسأله العملاء فعلاً، بصياغة العميل الطبيعية على واتساب، مع جواب قصير ودقيق من النص حرفياً في معناه (لا تضف معلومة غير موجودة). أعد JSON بالشكل: {"items":[{"question":"...","answer":"..."}]}`,
      },
      { role: "user", content: `عنوان المصدر: ${source.title}

${text}` },
    ],
  });
  const tokens = completion.usage?.total_tokens ?? 0;
  if (tokens) await withTenant(tenantId, (tx) => tx.subscription.updateMany({ where: { tenantId }, data: { aiTokensUsedThisPeriod: { increment: tokens } } }));

  let items: Array<{ question?: unknown; answer?: unknown }> = [];
  try {
    const parsed = JSON.parse(completion.choices[0]?.message.content ?? "{}");
    items = Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    throw new BrainError("لم يُرجع الذكاء الاصطناعي نتيجة صالحة — حاول مرة أخرى");
  }

  let created = 0;
  await withTenant(tenantId, async (tx) => {
    const total = await tx.knowledgeQa.count({ where: { tenantId } });
    for (const item of items.slice(0, EXTRACT_MAX_ITEMS)) {
      if (total + created >= BRAIN_LIMITS.maxQas) break;
      let qa: { q: string; a: string };
      try {
        qa = validateQa(String(item.question ?? ""), String(item.answer ?? ""));
      } catch {
        continue;
      }
      if (await tx.knowledgeQa.findFirst({ where: { tenantId, question: qa.q }, select: { id: true } })) continue;
      await tx.knowledgeQa.create({ data: { tenantId, question: qa.q, answer: qa.a, origin: "GENERATED", status: "PENDING" } });
      created++;
    }
  });
  invalidateBrainIndex(tenantId);
  return { created, tokens };
}
