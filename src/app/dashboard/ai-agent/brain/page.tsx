import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { hasEffectivePermission } from "@/lib/rbac";
import { getTenantChatbotLimits, isNodeTypeAllowed } from "@/lib/planLimits";
import { BRAIN_LIMITS, importLegacyFaq } from "@/lib/ai/brain/ingest";
import { AddKnowledge, BrainSettingsForm, GapItem, QaItem, ReindexButton, SourceActions, SuggestionItem, TestBrainBox } from "./BrainForms";
import { findKnowledgeGaps } from "@/lib/ai/brain/gaps";

export const metadata = { title: "عقل البوت — DMS Tech" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { TEXT: "نص", URL: "رابط", FILE: "ملف" };
const STATUS_BADGE: Record<string, string> = {
  READY: "bg-success-500/10 text-success-500",
  PROCESSING: "bg-white/5 text-slate-400",
  FAILED: "bg-danger-500/10 text-danger-500",
};
const STATUS_LABEL: Record<string, string> = { READY: "جاهز", PROCESSING: "قيد المعالجة", FAILED: "فشل" };

export default async function BrainPage() {
  const session = await requireTenantSession();
  const tenantId = session.user.tenantId;
  if (!hasEffectivePermission(session.user.permissions, "chatbot.edit")) {
    redirect(`/dashboard/no-access?from=${encodeURIComponent("عقل البوت")}`);
  }
  const limits = await getTenantChatbotLimits(tenantId);
  if (!isNodeTypeAllowed(limits, "ai_reply")) redirect("/dashboard/ai-agent");

  // الأسئلة الشائعة القديمة (في إعدادات الموظف الذكي) تنتقل للعقل تلقائياً أول مرة.
  await importLegacyFaq(tenantId).catch((err) => console.error("legacy faq import failed:", err));

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const data = await withTenant(tenantId, async (tx) => {
    const [config, sources, qas, pending, chars, brainReplies, llmStats, memories] = await Promise.all([
      tx.aiAgentConfig.upsert({ where: { tenantId }, update: {}, create: { tenantId } }),
      tx.knowledgeSource.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
      tx.knowledgeQa.findMany({
        where: { tenantId, status: "ACTIVE" }, orderBy: [{ hits: "desc" }, { createdAt: "desc" }], take: 300,
        select: { id: true, question: true, answer: true, directReply: true, hits: true, origin: true, embedding: true },
      }),
      tx.knowledgeQa.findMany({ where: { tenantId, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, question: true, answer: true, origin: true } }),
      tx.knowledgeSource.aggregate({ where: { tenantId }, _sum: { charCount: true } }),
      tx.aiReplyLog.count({ where: { tenantId, answerSource: "brain", createdAt: { gte: monthStart } } }),
      tx.aiReplyLog.aggregate({ where: { tenantId, answerSource: "llm", handoffTriggered: false, createdAt: { gte: monthStart } }, _count: { _all: true }, _avg: { totalTokens: true } }),
      tx.contactMemory.count({ where: { tenantId } }),
    ]);
    const gaps = await findKnowledgeGaps(tx, tenantId);
    return { config, sources, qas, pending, chars: chars._sum.charCount ?? 0, brainReplies, llmStats, memories, gaps };
  });

  const avgTokens = Math.round(data.llmStats._avg.totalTokens ?? 0);
  const savedTokens = data.brainReplies * avgTokens;
  const totalReplies = data.brainReplies + data.llmStats._count._all;
  const unindexedQas = data.qas.filter((q) => !q.embedding).length;

  const stats = [
    { label: "مصادر المعرفة", value: `${data.sources.length} / ${BRAIN_LIMITS.maxSources}` },
    { label: "حجم المعرفة", value: `${Math.round((data.chars / BRAIN_LIMITS.maxTotalChars) * 100)}%`, hint: `${data.chars.toLocaleString("en")} حرف` },
    { label: "أسئلة معتمدة", value: String(data.qas.length) },
    { label: "ردود مباشرة هذا الشهر", value: String(data.brainReplies), hint: totalReplies ? `${Math.round((data.brainReplies / totalReplies) * 100)}% من الردود بلا ذكاء اصطناعي` : undefined },
    { label: "توكنز وفّرها العقل", value: savedTokens.toLocaleString("en"), hint: avgTokens ? `متوسط الرد الذكي ${avgTokens.toLocaleString("en")} توكن` : "يظهر بعد أول ردود" },
    { label: "معلومات عملاء محفوظة", value: String(data.memories) },
  ];

  return (
    <div className="space-y-6">
      <Link href="/dashboard/ai-agent" className="text-sm text-accent-400 hover:underline">← رجوع لإعدادات الموظف الذكي</Link>
      <div>
        <h1 className="text-xl font-bold text-white">🧠 عقل البوت</h1>
        <p className="text-sm text-slate-400">
          درّب موظفك الذكي ببيانات متجرك. مع كل رسالة يجلب البوت المعلومات ذات الصلة فقط بدل إرسال كل شيء للذكاء الاصطناعي، والأسئلة
          المتكررة يجيبها فوراً من إجاباتك المعتمدة بلا أي توكنز.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="card p-3">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="mt-1 font-bold text-white" dir="ltr">{s.value}</p>
            {s.hint && <p className="mt-0.5 text-[11px] text-slate-500">{s.hint}</p>}
          </div>
        ))}
      </div>

      {data.pending.length > 0 && (
        <section className="card space-y-3 p-5">
          <h2 className="font-bold text-white">💡 إجابات مقترحة بانتظار اعتمادك ({data.pending.length})</h2>
          <p className="text-xs text-slate-400">من ردود فريقك على أسئلة لم يعرفها البوت، أو مستخرجة بالذكاء الاصطناعي من مصادرك. راجع الجواب (واحذف أي تفاصيل خاصة بعميل بعينه) ثم اعتمده.</p>
          <div className="space-y-2">{data.pending.map((q) => <SuggestionItem key={q.id} qa={q} />)}</div>
        </section>
      )}

      {data.gaps.length > 0 && (
        <section className="card space-y-3 p-5">
          <h2 className="font-bold text-white">🕳️ أسئلة لم يعرفها البوت — آخر 30 يوماً ({data.gaps.length})</h2>
          <p className="text-xs text-slate-400">أسئلة حقيقية من عملائك حوّلها البوت أو أجاب عنها بثقة منخفضة، مرتّبة بالتكرار. كل إجابة تضيفها تمنع تحويلات قادمة.</p>
          <div className="grid gap-2 md:grid-cols-2">{data.gaps.map((g) => <GapItem key={g.question} gap={g} />)}</div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card space-y-3 p-5 lg:col-span-2">
          <h2 className="font-bold text-white">➕ أضف معرفة</h2>
          <AddKnowledge />
        </section>
        <div className="space-y-6">
          <section className="card space-y-3 p-5">
            <h2 className="font-bold text-white">🔍 اختبر العقل</h2>
            <p className="text-xs text-slate-500">شاهد ماذا سيجد البوت لأي سؤال — بلا تكلفة.</p>
            <TestBrainBox />
          </section>
          <section className="card space-y-3 p-5">
            <h2 className="font-bold text-white">⚙️ سلوك العقل</h2>
            <BrainSettingsForm values={{ directAnswers: data.config.directAnswers, rememberCustomers: data.config.rememberCustomers, learnFromAgents: data.config.learnFromAgents }} />
          </section>
        </div>
      </div>

      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-white">❓ الأسئلة والأجوبة المعتمدة ({data.qas.length})</h2>
          {unindexedQas > 0 && <ReindexButton />}
        </div>
        {data.qas.length === 0 ? (
          <p className="text-sm text-slate-500">ابدأ بأكثر 10 أسئلة يسألها عملاؤك — كل سؤال منها يوفّر توكنز في كل مرة يتكرر.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {data.qas.map(({ embedding: _embedding, ...q }) => <QaItem key={q.id} qa={q} />)}
          </div>
        )}
      </section>

      <section className="card overflow-x-auto p-5">
        <h2 className="mb-3 font-bold text-white">📚 مصادر المعرفة ({data.sources.length})</h2>
        {data.sources.length === 0 ? (
          <p className="text-sm text-slate-500">لا مصادر بعد — أضف نصاً أو رابط صفحة أو ملف PDF من الأعلى.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-right text-xs text-slate-500">
                <th className="p-2 font-medium">المصدر</th>
                <th className="p-2 font-medium">النوع</th>
                <th className="p-2 font-medium">الحجم</th>
                <th className="p-2 font-medium">الحالة</th>
                <th className="p-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.id} className="border-b border-white/5 align-top">
                  <td className="p-2">
                    <p className="text-slate-100">{s.title}</p>
                    {s.sourceUrl && <p className="truncate text-xs text-slate-500" dir="ltr">{s.sourceUrl}</p>}
                    {s.kind === "URL" && s.refreshedAt && <p className="text-[11px] text-slate-500">🔄 يُحدَّث تلقائياً أسبوعياً · آخر فحص {s.refreshedAt.toLocaleDateString("ar-SA")}</p>}
                    {s.error && <p className={`text-xs ${s.status === "FAILED" ? "text-danger-500" : "text-warning-500"}`}>{s.error}</p>}
                  </td>
                  <td className="p-2 text-xs text-slate-400">{KIND_LABEL[s.kind]}</td>
                  <td className="p-2 text-xs text-slate-400" dir="ltr">{s.charCount.toLocaleString("en")} chars · {s.chunkCount} parts</td>
                  <td className="p-2"><span className={`badge ${STATUS_BADGE[s.status]}`}>{STATUS_LABEL[s.status]}</span></td>
                  <td className="p-2"><SourceActions id={s.id} canRefresh={s.kind === "URL"} ready={s.status === "READY"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
