import { getOpenAiClient } from "@/lib/ai/openaiClient";

/**
 * متجهات دلالية مختصرة (text-embedding-3-small بـ256 بُعداً — أرخص نموذج متجهات لدى OpenAI، ~0.02$ لكل مليون
 * توكن) تُخزَّن Float32 مضغوطة (1KB للمقطع) ويُحسب التشابه داخل التطبيق — بلا اعتماد على امتداد pgvector.
 * بلا مفتاح ذكاء اصطناعي: null، ويعمل البحث بالكلمات المفتاحية وحده.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 256;
const BATCH = 96;

export type EmbedResult = { vectors: Float32Array[]; tokens: number };

export async function embedTexts(texts: string[]): Promise<EmbedResult | null> {
  if (!texts.length) return { vectors: [], tokens: 0 };
  const openai = await getOpenAiClient();
  if (!openai) return null;
  const vectors: Float32Array[] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await openai.client.embeddings.create({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      input: texts.slice(i, i + BATCH).map((t) => t.slice(0, 6000)),
    });
    for (const item of [...res.data].sort((a, b) => a.index - b.index)) vectors.push(normalize(Float32Array.from(item.embedding)));
    tokens += res.usage?.total_tokens ?? 0;
  }
  return { vectors, tokens };
}

/** متجه واحد — للسؤال الوارد. فشل الشبكة لا يُسقط الرد (يُكمَل بالكلمات المفتاحية). */
export async function embedQuery(text: string): Promise<{ vector: Float32Array; tokens: number } | null> {
  try {
    const r = await embedTexts([text]);
    return r && r.vectors[0] ? { vector: r.vectors[0], tokens: r.tokens } : null;
  } catch (err) {
    console.error("⚠️ تعذّر حساب متجه السؤال — بحث بالكلمات فقط:", err instanceof Error ? err.message : err);
    return null;
  }
}

function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i]! /= n;
  return v;
}

export function packVector(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function unpackVector(bytes: Uint8Array | null | undefined): Float32Array | null {
  if (!bytes || bytes.byteLength % 4 !== 0 || bytes.byteLength === 0) return null;
  // نسخة محاذاة (byteOffset قد لا يكون مضاعفاً لـ4 داخل Buffer مشترك).
  return new Float32Array(Uint8Array.from(bytes).buffer);
}

/** المتجهات مُطبَّعة ⇒ الضرب النقطي = تشابه جيب التمام. */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}
