import type { Prisma } from "@prisma/client";
import { tokenize } from "./text";

/**
 * فجوات المعرفة: أسئلة حقيقية لم يعرف البوت إجابتها (حوّلها لعجزه، أو أجاب بثقة منخفضة، أو قيّمها صاحب الحساب
 * "غير دقيق") — مجمّعة حسب التشابه ومرتّبة بالتكرار. أهم قائمة تدريب: كل فجوة تُسد تمنع تحويلات قادمة.
 * التجميع بالكلمات (بلا متجهات) فلا تكلفة لفتح الصفحة.
 */

const WINDOW_DAYS = 30;
const LOW_CONFIDENCE = 60;
// تحويلات سببها نقص المعرفة فقط — لا الشكاوى/طلب موظف/الحدود التقنية.
const KNOWLEDGE_HANDOFF = /ثقة منخفضة|قرّر الموظف الذكي|تكرر|تعذّر التوصل/;

export type KnowledgeGap = { question: string; count: number; lastAt: Date; examples: string[] };

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
};

export async function findKnowledgeGaps(tx: Prisma.TransactionClient, tenantId: string, limit = 15): Promise<KnowledgeGap[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  const [logs, qas] = await Promise.all([
    tx.aiReplyLog.findMany({
      where: {
        tenantId, createdAt: { gte: since }, answerSource: "llm",
        OR: [{ rating: "INACCURATE" }, { handoffTriggered: false, confidenceScore: { lt: LOW_CONFIDENCE } }, { handoffTriggered: true }],
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { userMessage: true, handoffTriggered: true, handoffReason: true, createdAt: true },
    }),
    tx.knowledgeQa.findMany({ where: { tenantId }, select: { question: true } }),
  ]);

  const known = qas.map((q) => new Set(tokenize(q.question)));
  // كل مجموعة تحتفظ بكلمات كل صيغها — سؤال جديد ينضم إن شابه أياً منها (لا الأول فقط).
  const clusters: Array<KnowledgeGap & { members: Set<string>[] }> = [];
  for (const log of logs) {
    if (log.handoffTriggered && !KNOWLEDGE_HANDOFF.test(log.handoffReason ?? "")) continue;
    const text = log.userMessage.trim();
    const terms = new Set(tokenize(text));
    if (terms.size < 2) continue; // "طيب"، "شكراً" — ليست أسئلة
    if (known.some((k) => jaccard(k, terms) >= 0.6)) continue; // سُدّت بإجابة معتمدة أو مقترحة
    const cluster = clusters.find((c) => c.members.some((m) => jaccard(m, terms) >= 0.5));
    if (cluster) {
      cluster.count++;
      if (cluster.members.length < 20) cluster.members.push(terms);
      if (cluster.examples.length < 3 && text !== cluster.question && !cluster.examples.includes(text)) cluster.examples.push(text);
    } else {
      clusters.push({ question: text, count: 1, lastAt: log.createdAt, examples: [], members: [terms] });
    }
  }
  return clusters
    .sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, limit)
    .map(({ members: _members, ...gap }) => gap);
}
