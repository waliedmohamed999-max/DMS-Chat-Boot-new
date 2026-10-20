import type { Prisma } from "@prisma/client";
import { cosine, embedQuery, unpackVector } from "./embeddings";
import { tokenize } from "./text";

/**
 * فهرس معرفة التاجر في الذاكرة (لكل خادم): يُحمَّل مرة ثم يُعاد استخدامه حتى يتغيّر شيء (بصمة = عدد وآخر تعديل
 * للمصادر والأسئلة). البحث هجين: تشابه دلالي (إن وُجدت متجهات) + تغطية كلمات السؤال المفتاحية.
 */

type IndexedChunk = { id: string; sourceId: string; sourceTitle: string; content: string; vec: Float32Array | null; terms: Set<string> };
type IndexedQa = { id: string; question: string; answer: string; directReply: boolean; vec: Float32Array | null; terms: Set<string> };
type TenantIndex = { stamp: string; chunks: IndexedChunk[]; qas: IndexedQa[]; idf: Map<string, number>; loadedAt: number };

const MAX_CACHED_TENANTS = 40;
const g = globalThis as unknown as { __brainIndex?: Map<string, TenantIndex> };
const cache = (g.__brainIndex ??= new Map());

/** يُستدعى بعد أي تعديل للمعرفة — البصمة كانت ستكتشفه أيضاً، لكن هذا يوفّر استعلام البصمة التالي. */
export function invalidateBrainIndex(tenantId: string) {
  cache.delete(tenantId);
}

async function stampOf(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
  const [s, q] = await Promise.all([
    tx.knowledgeSource.aggregate({ where: { tenantId }, _count: { _all: true }, _max: { updatedAt: true } }),
    tx.knowledgeQa.aggregate({ where: { tenantId }, _count: { _all: true }, _max: { updatedAt: true } }),
  ]);
  return `${s._count._all}:${s._max.updatedAt?.getTime() ?? 0}:${q._count._all}:${q._max.updatedAt?.getTime() ?? 0}`;
}

async function loadIndex(tx: Prisma.TransactionClient, tenantId: string): Promise<TenantIndex> {
  const stamp = await stampOf(tx, tenantId);
  const cached = cache.get(tenantId);
  if (cached && cached.stamp === stamp) return cached;

  const [chunks, qas] = await Promise.all([
    tx.knowledgeChunk.findMany({
      where: { tenantId, source: { status: "READY" } },
      select: { id: true, sourceId: true, content: true, embedding: true, source: { select: { title: true } } },
    }),
    tx.knowledgeQa.findMany({ where: { tenantId, status: "ACTIVE" }, select: { id: true, question: true, answer: true, directReply: true, embedding: true } }),
  ]);

  const index: TenantIndex = {
    stamp,
    loadedAt: Date.now(),
    chunks: chunks.map((c) => ({
      id: c.id, sourceId: c.sourceId, sourceTitle: c.source.title, content: c.content,
      vec: unpackVector(c.embedding), terms: new Set(tokenize(c.content)),
    })),
    qas: qas.map((q) => ({
      id: q.id, question: q.question, answer: q.answer, directReply: q.directReply,
      vec: unpackVector(q.embedding), terms: new Set(tokenize(q.question)),
    })),
    idf: new Map(),
  };
  // ندرة الكلمة عبر كل وثائق التاجر — كلمة نادرة ("الاسترجاع") أثقل وزناً من شائعة ("منتج").
  const docs = [...index.chunks.map((c) => c.terms), ...index.qas.map((q) => q.terms)];
  const df = new Map<string, number>();
  for (const terms of docs) for (const t of terms) df.set(t, (df.get(t) ?? 0) + 1);
  for (const [t, n] of df) index.idf.set(t, Math.log(1 + docs.length / n));

  cache.set(tenantId, index);
  if (cache.size > MAX_CACHED_TENANTS) cache.delete(cache.keys().next().value!);
  return index;
}

/** نسبة وزن كلمات السؤال الموجودة في الوثيقة (0..1). */
function keywordScore(queryTerms: string[], doc: Set<string>, idf: Map<string, number>): number {
  if (!queryTerms.length) return 0;
  let total = 0;
  let hit = 0;
  for (const t of new Set(queryTerms)) {
    const w = idf.get(t) ?? Math.log(2);
    total += w;
    if (doc.has(t)) hit += w;
    else if (t.length >= 4 && [...doc].some((d) => d.length >= 4 && (d.startsWith(t) || t.startsWith(d)))) hit += w * 0.7;
  }
  return total ? hit / total : 0;
}

export type BrainHit = { id: string; score: number };
export type BrainSearchResult = {
  semantic: boolean;
  queryTokens: number;
  chunks: Array<BrainHit & { sourceTitle: string; content: string }>;
  qas: Array<BrainHit & { question: string; answer: string; directReply: boolean; similarity: number }>;
  totalChunks: number;
  totalQas: number;
};

const MAX_CHUNKS = 4;
const MAX_QAS = 3;
const MIN_CHUNK_SCORE = 0.3;
const MIN_QA_SCORE = 0.42;

export async function searchBrain(tx: Prisma.TransactionClient, tenantId: string, query: string): Promise<BrainSearchResult> {
  const index = await loadIndex(tx, tenantId);
  const empty: BrainSearchResult = { semantic: false, queryTokens: 0, chunks: [], qas: [], totalChunks: index.chunks.length, totalQas: index.qas.length };
  if (!index.chunks.length && !index.qas.length) return empty;

  const terms = tokenize(query);
  const hasVectors = index.chunks.some((c) => c.vec) || index.qas.some((q) => q.vec);
  const q = hasVectors ? await embedQuery(query) : null;

  const score = (vec: Float32Array | null, docTerms: Set<string>) => {
    const kw = keywordScore(terms, docTerms, index.idf);
    if (!q || !vec) return { score: kw, similarity: kw };
    const sim = cosine(q.vector, vec);
    return { score: 0.75 * sim + 0.25 * kw, similarity: sim };
  };

  const chunks = index.chunks
    .map((c) => ({ c, s: score(c.vec, c.terms) }))
    .filter((x) => x.s.score >= MIN_CHUNK_SCORE)
    .sort((a, b) => b.s.score - a.s.score)
    .slice(0, MAX_CHUNKS)
    .map(({ c, s }) => ({ id: c.id, score: round(s.score), sourceTitle: c.sourceTitle, content: c.content }));

  const qas = index.qas
    .map((x) => ({ x, s: score(x.vec, x.terms) }))
    .filter((y) => y.s.score >= MIN_QA_SCORE)
    .sort((a, b) => b.s.score - a.s.score)
    .slice(0, MAX_QAS)
    .map(({ x, s }) => ({ id: x.id, score: round(s.score), similarity: round(s.similarity), question: x.question, answer: x.answer, directReply: x.directReply }));

  return { semantic: !!q, queryTokens: q?.tokens ?? 0, chunks, qas, totalChunks: index.chunks.length, totalQas: index.qas.length };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// عتبة الرد المباشر بلا نموذج: تطابق شبه حرفي فقط. دلالياً 0.86+ (إعادة صياغة لنفس السؤال)، وبالكلمات وحدها 0.85+.
export const DIRECT_SEMANTIC_THRESHOLD = 0.86;
export const DIRECT_KEYWORD_THRESHOLD = 0.85;

/**
 * سؤال قابل للرد المباشر: إجابة معتمدة مسموح إرسالها حرفياً + تطابق عالٍ + رسالة مكتفية بذاتها (ليست متابعة
 * قصيرة مثل "وكم سعره؟" تعتمد على سياق سابق).
 */
export function pickDirectAnswer(result: BrainSearchResult, query: string) {
  const top = result.qas[0];
  if (!top || !top.directReply) return null;
  if (tokenize(query).length < 2) return null;
  const threshold = result.semantic ? DIRECT_SEMANTIC_THRESHOLD : DIRECT_KEYWORD_THRESHOLD;
  return top.similarity >= threshold ? top : null;
}
