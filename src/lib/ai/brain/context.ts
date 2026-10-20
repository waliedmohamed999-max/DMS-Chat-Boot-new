import type { Prisma } from "@prisma/client";
import { pickDirectAnswer, searchBrain, type BrainSearchResult } from "./search";

export type BrainConsultation = {
  /** إجابة معتمدة تُرسَل حرفياً بلا نموذج (صفر توكنز). */
  direct: { qaId: string; answer: string; similarity: number } | null;
  /** رسالة نظام مختصرة بالمعرفة ذات الصلة فقط — تُلحق بعد سجل المحادثة. */
  contextMessage: string | null;
  knowledgeUsed: number;
  search: BrainSearchResult | null;
};

const MAX_CONTEXT_CHARS = 3500;

/**
 * يستشير عقل البوت لرسالة العميل: يبحث في المعرفة والأسئلة المعتمدة، ويقرر إن كانت هناك إجابة جاهزة،
 * وإلا يبني سياقاً مختصراً (3-4 مقاطع + أسئلة قريبة + ذاكرة العميل) بدل إرسال كل المعرفة للنموذج.
 * أي فشل في البحث لا يُسقط الرد — يكمل النموذج بلا معرفة إضافية.
 */
export async function consultBrain(
  tx: Prisma.TransactionClient,
  tenantId: string,
  query: string,
  opts: { allowDirect: boolean; memory?: Array<{ key: string; value: string }> }
): Promise<BrainConsultation> {
  let search: BrainSearchResult | null = null;
  try {
    search = await searchBrain(tx, tenantId, query);
  } catch (err) {
    console.error("⚠️ تعذّر البحث في عقل البوت:", err instanceof Error ? err.message : err);
  }

  const directHit = opts.allowDirect && search ? pickDirectAnswer(search, query) : null;
  if (directHit) {
    await tx.knowledgeQa.update({ where: { id: directHit.id }, data: { hits: { increment: 1 }, lastHitAt: new Date() } }).catch(() => {});
    return { direct: { qaId: directHit.id, answer: directHit.answer, similarity: directHit.similarity }, contextMessage: null, knowledgeUsed: 1, search };
  }

  const parts: string[] = [];
  let used = 0;
  let budget = MAX_CONTEXT_CHARS;
  if (search?.qas.length) {
    const lines = search.qas.map((q) => `- س: ${q.question}\n  ج: ${q.answer}`);
    parts.push(`أسئلة وأجوبة معتمدة من صاحب المتجر (أجب بمضمونها عند تطابق المعنى):\n${lines.join("\n")}`);
    used += search.qas.length;
    budget -= lines.join("\n").length;
  }
  if (search?.chunks.length) {
    const lines: string[] = [];
    for (const c of search.chunks) {
      if (budget <= 200) break;
      const text = c.content.slice(0, budget);
      lines.push(`[${c.sourceTitle}]\n${text}`);
      budget -= text.length;
      used++;
    }
    if (lines.length) parts.push(`مقتطفات من قاعدة معرفة المتجر ذات صلة بسؤال العميل:\n${lines.join("\n---\n")}`);
  }
  if (opts.memory?.length) {
    parts.push(`معلومات محفوظة عن هذا العميل من محادثات سابقة (استخدمها لتخصيص ردك بلا ذكرها حرفياً):\n${opts.memory.map((m) => `- ${m.key}: ${m.value}`).join("\n")}`);
  }

  const contextMessage = parts.length
    ? `${parts.join("\n\n")}\n\nاعتمد على هذه المعلومات فقط فيما تخص المتجر وسياساته؛ إن لم تجد الإجابة فيها ولا عبر الأدوات فلا تخمّن — قل إنك ستتأكد أو حوّل لموظف.`
    : null;
  return { direct: null, contextMessage, knowledgeUsed: used, search };
}
