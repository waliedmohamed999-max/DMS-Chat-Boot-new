"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFlowGraph, togglePublish, recordTestRun, deleteFlow } from "@/app/dashboard/chatbot/actions";
import { NODE_TYPES, TIER_BADGE, TIER_LABELS_AR } from "@/lib/chatbot/nodeTypes";
import { WhatsAppPreview } from "@/components/dashboard/WhatsAppPreview";
import { UpsellModal } from "@/components/dashboard/UpsellModal";
import type { ChatbotNodeTypeKey } from "@/lib/planLimits";
import type { FlowGraph } from "@/lib/chatbot/types";
import { advanceSimulation, EMPTY_SIMULATION_SESSION, type SimulationBubble, type SimulationSession } from "@/lib/chatbot/simulate";
import {
  type BuilderStep,
  type BranchPath,
  graphToSteps,
  stepsToGraph,
  getColumn,
  setColumn,
  createStep,
  isEndOfChain,
  countSteps,
  newStepId,
} from "@/lib/chatbot/builderModel";

const ADDABLE_TYPES: ChatbotNodeTypeKey[] = ["message", "question", "condition", "menu", "ai_reply", "api_call", "handoff", "end"];

export function ChatbotFlowBuilder({
  flowId,
  initialGraph,
  initialStatus,
  storeName,
  connectedPhoneNumber,
  allowedNodeTypes,
  canPublish,
  canDelete,
  initialTestRunCount,
}: {
  flowId: string;
  initialGraph: FlowGraph;
  initialStatus: "DRAFT" | "PUBLISHED";
  storeName: string;
  connectedPhoneNumber?: string | null;
  allowedNodeTypes: ChatbotNodeTypeKey[];
  canPublish: boolean;
  canDelete: boolean;
  initialTestRunCount: number;
}) {
  const router = useRouter();
  const { steps: initialSteps, droppedCount } = useMemo(() => graphToSteps(initialGraph), [initialGraph]);
  const [steps, setSteps] = useState<BuilderStep[]>(initialSteps);
  const [showCleanupNotice, setShowCleanupNotice] = useState(droppedCount > 0);
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [testInput, setTestInput] = useState("");
  const [testLog, setTestLog] = useState<SimulationBubble[]>([]);
  const [testSession, setTestSession] = useState<SimulationSession>(EMPTY_SIMULATION_SESSION);
  const [hasTestedThisSession, setHasTestedThisSession] = useState(initialTestRunCount > 0);
  const [lockedType, setLockedType] = useState<ChatbotNodeTypeKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAllowed = (type: ChatbotNodeTypeKey) => allowedNodeTypes.includes(type);

  function updateColumn(path: BranchPath, transform: (column: BuilderStep[]) => BuilderStep[]) {
    setSteps((prev) => setColumn(prev, path, transform(getColumn(prev, path))));
  }

  const graph = useMemo<FlowGraph>(() => stepsToGraph(steps), [steps]);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await saveFlowGraph(flowId, graph);
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّر الحفظ");
      }
    });
  }

  function handleTogglePublish() {
    setError(null);
    const next = status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    startTransition(async () => {
      try {
        await togglePublish(flowId, next === "PUBLISHED");
        setStatus(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّرت العملية");
      }
    });
  }

  function handleDelete() {
    if (!confirm("هل أنت متأكد من حذف هذا التدفق؟ لا يمكن التراجع.")) return;
    startTransition(async () => {
      await deleteFlow(flowId);
      router.push("/dashboard/chatbot");
    });
  }

  function runTest() {
    if (!testInput.trim()) return;
    const { bubbles, session, traversal } = advanceSimulation(graph, testSession, testInput);
    setTestLog((prev) => [...prev, ...bubbles]);
    setTestSession(session);
    setTestInput("");
    setHasTestedThisSession(true);
    startTransition(() => recordTestRun(flowId, traversal));
  }

  function resetTest() {
    setTestLog([]);
    setTestSession(EMPTY_SIMULATION_SESSION);
  }

  const canPublishNow = canPublish && (hasTestedThisSession || status === "PUBLISHED");

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-white">خطوات المحادثة</h2>
            <p className="text-xs text-slate-500">كل خطوة تُنفَّذ تلقائياً بعد التي قبلها — بلا حاجة لأي وصل يدوي.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={isPending} className="btn-secondary text-xs">
              حفظ
            </button>
            {canPublish && (
              <button
                onClick={handleTogglePublish}
                disabled={isPending || (!canPublishNow && status !== "PUBLISHED")}
                title={!canPublishNow && status !== "PUBLISHED" ? "يجب اختبار التدفق حياً أولاً" : undefined}
                className="btn-primary text-xs"
              >
                {status === "PUBLISHED" ? "إلغاء النشر" : "نشر التدفق"}
              </button>
            )}
            {canDelete && (
              <button onClick={handleDelete} disabled={isPending} className="btn-danger text-xs">
                حذف
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-500">{error}</div>
        )}
        {showCleanupNotice && (
          <div className="mb-3 flex items-start justify-between gap-2 rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-xs text-accent-400">
            <span>
              🧹 تم تجاهل {droppedCount} خطوة قديمة غير مرتبطة فعلياً بمسار التدفق (لم تكن تعمل أصلاً) عند التحويل للواجهة الجديدة.
            </span>
            <button onClick={() => setShowCleanupNotice(false)} className="shrink-0 text-accent-300 hover:underline">
              إخفاء
            </button>
          </div>
        )}
        {!hasTestedThisSession && status !== "PUBLISHED" && (
          <p className="rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-xs text-warning-500">
            ⚠️ يجب "اختبار حي" واحد على الأقل قبل تفعيل زر النشر.
          </p>
        )}
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-navy-900 px-3 py-2 text-xs text-slate-400">
          <span className="text-base">🚀</span>
          <span>بداية — عند أول رسالة من العميل</span>
        </div>

        <div className="max-h-[460px] overflow-y-auto pl-1">
          <FlowColumn
            steps={steps}
            path={[]}
            allowedNodeTypes={allowedNodeTypes}
            isAllowed={isAllowed}
            onChange={updateColumn}
            onLockedType={setLockedType}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr] lg:items-stretch">
        <div className="card flex flex-col items-center p-4">
          <p className="mb-2 text-center text-xs font-medium text-slate-400">معاينة حية</p>
          <div className="flex flex-1 items-center justify-center">
            <WhatsAppPreview
              graph={graph}
              storeName={storeName}
              connectedPhoneNumber={connectedPhoneNumber}
              liveLog={testLog}
              input={{ value: testInput, onChange: setTestInput, onSend: runTest }}
            />
          </div>
        </div>

        <div className="card flex flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-white">🧪 اختبار قبل النشر</h2>
            {testLog.length > 0 && (
              <button onClick={resetTest} className="text-[11px] text-accent-400 hover:underline">
                🔄 إعادة تشغيل المحادثة
              </button>
            )}
          </div>
          {testSession.currentNodeId && (
            <p className="mb-2 rounded-lg border border-accent-500/20 bg-accent-500/5 px-2.5 py-1.5 text-[11px] text-accent-300">
              💬 البوت بانتظار ردك على السؤال الأخير — اكتب رداً واقعياً لمتابعة نفس المحادثة.
            </p>
          )}
          <div className="mb-3 max-h-64 flex-1 space-y-2 overflow-y-auto">
            {testLog.length === 0 && (
              <p className="text-xs text-slate-500">اكتب رسالة تجريبية أدناه لمعاينة سلوك البوت الكامل (بما في ذلك الشروط).</p>
            )}
            {testLog.map((entry, i) => (
              <div key={i} className={`flex ${entry.from === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-xs ${entry.from === "user" ? "bg-accent-500 text-white" : "bg-navy-700 text-slate-200"}`}>
                  {entry.text}
                  {entry.link && <div className="mt-1 border-t border-white/10 pt-1 text-accent-300">🔗 {entry.link.text}</div>}
                  {entry.media && (
                    <div className="mt-1 border-t border-white/10 pt-1 text-accent-300">
                      {entry.media.type === "image" ? "🖼️" : entry.media.type === "video" ? "🎥" : "📎"} {entry.media.filename || entry.media.type}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runTest()}
              className="input-field flex-1 text-xs"
              placeholder="مثال: أين طلبي؟"
            />
            <button onClick={runTest} className="btn-primary text-xs">
              إرسال
            </button>
          </div>
        </div>
      </div>

      {lockedType && (
        <UpsellModal
          title={`عقدة "${NODE_TYPES[lockedType].label}" غير متاحة في باقتك`}
          description={NODE_TYPES[lockedType].description}
          requiredTierLabel={`تتطلب الباقة ${TIER_LABELS_AR[NODE_TYPES[lockedType].minTier]}`}
          onClose={() => setLockedType(null)}
        />
      )}
    </div>
  );
}

/** قائمة خطوات متسلسلة واحدة (الجذر، أو أحد فرعي شرط) — تعرض نفسها بتكرار داخل عقد "شرط". */
function FlowColumn({
  steps,
  path,
  allowedNodeTypes,
  isAllowed,
  onChange,
  onLockedType,
}: {
  steps: BuilderStep[];
  path: BranchPath;
  allowedNodeTypes: ChatbotNodeTypeKey[];
  isAllowed: (type: ChatbotNodeTypeKey) => boolean;
  onChange: (path: BranchPath, transform: (column: BuilderStep[]) => BuilderStep[]) => void;
  onLockedType: (type: ChatbotNodeTypeKey) => void;
}) {
  const canAddMore = steps.length === 0 || !isEndOfChain(steps[steps.length - 1]);

  function updateStep(index: number, partial: Partial<BuilderStep>) {
    onChange(path, (col) => col.map((s, i) => (i === index ? ({ ...s, ...partial } as BuilderStep) : s)));
  }

  function moveStep(index: number, direction: -1 | 1) {
    onChange(path, (col) => {
      const target = index + direction;
      if (target < 0 || target >= col.length) return col;
      const next = [...col];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function deleteStep(index: number) {
    const step = steps[index];
    if (step?.type === "condition") {
      const nested = countSteps(step.yes) + countSteps(step.no);
      if (nested > 0 && !confirm(`هذا الشرط يحتوي ${nested} خطوة داخل فروعه — حذفه سيحذفها جميعاً. متابعة؟`)) return;
    }
    if (step?.type === "menu") {
      const nested = step.branches.reduce((s, b) => s + countSteps(b.steps), 0) + countSteps(step.elseSteps);
      if (nested > 0 && !confirm(`قائمة الاختيارات هذه تحتوي ${nested} خطوة داخل فروعها — حذفها سيحذفها جميعاً. متابعة؟`)) return;
    }
    onChange(path, (col) => col.filter((_, i) => i !== index));
  }

  function addStep(type: ChatbotNodeTypeKey) {
    if (!isAllowed(type)) {
      onLockedType(type);
      return;
    }
    onChange(path, (col) => [...col, createStep(type)]);
  }

  function updateMenuBranch(stepIndex: number, branchIndex: number, partial: { label?: string; keywords?: string }) {
    onChange(path, (col) =>
      col.map((s, i) =>
        i === stepIndex && s.type === "menu"
          ? { ...s, branches: s.branches.map((b, bi) => (bi === branchIndex ? { ...b, ...partial } : b)) }
          : s
      )
    );
  }

  function addMenuBranch(stepIndex: number) {
    onChange(path, (col) =>
      col.map((s, i) =>
        i === stepIndex && s.type === "menu"
          ? { ...s, branches: [...s.branches, { id: newStepId(), label: `الخيار ${s.branches.length + 1}`, keywords: "", steps: [] }] }
          : s
      )
    );
  }

  function deleteMenuBranch(stepIndex: number, branchIndex: number) {
    const step = steps[stepIndex];
    if (step?.type === "menu") {
      const branch = step.branches[branchIndex];
      const nested = branch ? countSteps(branch.steps) : 0;
      if (nested > 0 && !confirm(`هذا الخيار يحتوي ${nested} خطوة — حذفه سيحذفها جميعاً. متابعة؟`)) return;
    }
    onChange(path, (col) =>
      col.map((s, i) => (i === stepIndex && s.type === "menu" ? { ...s, branches: s.branches.filter((_, bi) => bi !== branchIndex) } : s))
    );
  }

  return (
    <div className="space-y-2">
      {steps.length === 0 && <p className="px-1 text-xs text-slate-500">لا خطوات هنا بعد.</p>}

      {steps.map((step, index) => {
        const meta = NODE_TYPES[step.type];
        const pinned = isEndOfChain(step);
        const upDisabled = index === 0 || pinned;
        const downDisabled = index === steps.length - 1 || pinned || isEndOfChain(steps[index + 1]);

        return (
          <div key={step.id}>
            <div className="rounded-lg border border-white/10 bg-navy-800">
              <div className="flex items-center justify-between gap-2 rounded-t-lg border-b border-white/5 bg-navy-900 px-3 py-1.5">
                <span className="text-xs font-medium text-slate-300">
                  {meta.icon} {meta.label}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveStep(index, -1)} disabled={upDisabled} className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-white/5 disabled:opacity-20">
                    ▲
                  </button>
                  <button onClick={() => moveStep(index, 1)} disabled={downDisabled} className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-white/5 disabled:opacity-20">
                    ▼
                  </button>
                  <button onClick={() => deleteStep(index)} className="rounded px-1.5 py-0.5 text-[10px] text-danger-500 hover:bg-danger-500/10">
                    حذف
                  </button>
                </div>
              </div>

              <div className="space-y-2 p-2.5">
                {(step.type === "message" || step.type === "question") && (
                  <textarea
                    value={step.text}
                    onChange={(e) => updateStep(index, { text: e.target.value } as Partial<BuilderStep>)}
                    rows={2}
                    className="input-field w-full !py-1.5 text-[11px]"
                    placeholder={step.type === "question" ? "نص السؤال الذي ينتظر رد العميل" : "نص الرسالة"}
                  />
                )}

                {step.type === "message" && (() => {
                  const clearAttachment = {
                    linkUrl: undefined, linkText: undefined,
                    mediaUrl: undefined, mediaType: undefined, mediaFilename: undefined,
                  } as Partial<BuilderStep>;

                  if (step.linkUrl !== undefined) {
                    return (
                      <div className="space-y-1.5 rounded-lg border border-accent-500/20 bg-accent-500/5 p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-accent-300">🔗 زر رابط (يظهر باسمه بدل الرابط الخام)</span>
                          <button onClick={() => updateStep(index, clearAttachment)} className="text-[10px] text-danger-500 hover:underline">
                            ✕ إزالة
                          </button>
                        </div>
                        <input
                          value={step.linkText ?? ""}
                          onChange={(e) => updateStep(index, { linkText: e.target.value } as Partial<BuilderStep>)}
                          className="input-field w-full !py-1.5 text-[11px]"
                          placeholder="اسم الزر الظاهر للعميل (مثال: تصفّح المتجر)"
                        />
                        <input
                          value={step.linkUrl ?? ""}
                          onChange={(e) => updateStep(index, { linkUrl: e.target.value } as Partial<BuilderStep>)}
                          className="input-field w-full !py-1.5 text-[11px]"
                          placeholder="الرابط (يجب أن يبدأ بـ https://)"
                          dir="ltr"
                        />
                      </div>
                    );
                  }

                  if (step.mediaUrl !== undefined) {
                    const mediaLabel = step.mediaType === "image" ? "🖼️ صورة" : step.mediaType === "video" ? "🎥 فيديو" : "📎 ملف";
                    return (
                      <div className="space-y-1.5 rounded-lg border border-accent-500/20 bg-accent-500/5 p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-accent-300">{mediaLabel} مرفق مع الرسالة</span>
                          <button onClick={() => updateStep(index, clearAttachment)} className="text-[10px] text-danger-500 hover:underline">
                            ✕ إزالة
                          </button>
                        </div>
                        <input
                          value={step.mediaUrl ?? ""}
                          onChange={(e) => updateStep(index, { mediaUrl: e.target.value } as Partial<BuilderStep>)}
                          className="input-field w-full !py-1.5 text-[11px]"
                          placeholder={`رابط ${mediaLabel.split(" ")[1]} المباشر (يجب أن يبدأ بـ https://)`}
                          dir="ltr"
                        />
                        {step.mediaType === "document" && (
                          <input
                            value={step.mediaFilename ?? ""}
                            onChange={(e) => updateStep(index, { mediaFilename: e.target.value } as Partial<BuilderStep>)}
                            className="input-field w-full !py-1.5 text-[11px]"
                            placeholder="اسم الملف الظاهر للعميل (مثال: قائمة_الأسعار.pdf)"
                          />
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => updateStep(index, { linkUrl: "", linkText: "" } as Partial<BuilderStep>)} className="btn-secondary text-[11px]">
                        + 🔗 رابط
                      </button>
                      <button onClick={() => updateStep(index, { mediaUrl: "", mediaType: "image" } as Partial<BuilderStep>)} className="btn-secondary text-[11px]">
                        + 🖼️ صورة
                      </button>
                      <button onClick={() => updateStep(index, { mediaUrl: "", mediaType: "video" } as Partial<BuilderStep>)} className="btn-secondary text-[11px]">
                        + 🎥 فيديو
                      </button>
                      <button onClick={() => updateStep(index, { mediaUrl: "", mediaType: "document", mediaFilename: "" } as Partial<BuilderStep>)} className="btn-secondary text-[11px]">
                        + 📎 ملف
                      </button>
                    </div>
                  );
                })()}

                {step.type === "api_call" && (
                  <>
                    <input
                      value={step.text}
                      onChange={(e) => updateStep(index, { text: e.target.value } as Partial<BuilderStep>)}
                      className="input-field w-full !py-1.5 text-[11px]"
                      placeholder="وصف مختصر (يظهر في المعاينة فقط)"
                    />
                    <input
                      value={step.apiUrl}
                      onChange={(e) => updateStep(index, { apiUrl: e.target.value } as Partial<BuilderStep>)}
                      className="input-field w-full !py-1.5 text-[11px]"
                      placeholder="رابط API (مثال: https://api.example.com/order-status)"
                      dir="ltr"
                    />
                  </>
                )}

                {step.type === "condition" && (
                  <input
                    value={step.keywords}
                    onChange={(e) => updateStep(index, { keywords: e.target.value } as Partial<BuilderStep>)}
                    className="input-field w-full !py-1.5 text-[11px]"
                    placeholder="كلمات مفتاحية مفصولة بفاصلة (مثال: نعم, أيوه, تمام)"
                  />
                )}

                {step.type === "menu" && <p className="text-[11px] text-slate-400">{meta.description}</p>}

                {(step.type === "ai_reply" || step.type === "handoff" || step.type === "end") && (
                  <p className="text-[11px] text-slate-400">{meta.description}</p>
                )}
              </div>

              {step.type === "condition" && (
                <div className="p-2.5">
                  <TreeForkConnector />
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded-lg border border-success-500/20 bg-success-500/5 p-2">
                      <p className="mb-2 text-[11px] font-medium text-success-500">✅ لو تحقق الشرط</p>
                      <FlowColumn
                        steps={step.yes}
                        path={[...path, "yes"]}
                        allowedNodeTypes={allowedNodeTypes}
                        isAllowed={isAllowed}
                        onChange={onChange}
                        onLockedType={onLockedType}
                      />
                    </div>
                    <div className="rounded-lg border border-danger-500/20 bg-danger-500/5 p-2">
                      <p className="mb-2 text-[11px] font-medium text-danger-500">❌ لو لم يتحقق</p>
                      <FlowColumn
                        steps={step.no}
                        path={[...path, "no"]}
                        allowedNodeTypes={allowedNodeTypes}
                        isAllowed={isAllowed}
                        onChange={onChange}
                        onLockedType={onLockedType}
                      />
                    </div>
                  </div>
                </div>
              )}

              {step.type === "menu" && (
                <div className="relative space-y-2 border-t border-white/5 p-2.5 pr-6">
                  <div className="pointer-events-none absolute bottom-6 right-3 top-3 w-px bg-white/15" />
                  {step.branches.map((branch, branchIndex) => (
                    <div key={branch.id} className="relative">
                      <div className="pointer-events-none absolute right-3 top-6 h-px w-3 bg-white/15" />
                      <div className="rounded-lg border border-accent-500/20 bg-accent-500/5 p-2.5">
                        <div className="mb-2 flex items-center gap-2">
                          <input
                            value={branch.label}
                            onChange={(e) => updateMenuBranch(index, branchIndex, { label: e.target.value })}
                            className="input-field flex-1 !py-1.5 text-[11px] font-medium"
                            placeholder="اسم الخيار (مثال: تتبع الطلب)"
                          />
                          <button
                            onClick={() => deleteMenuBranch(index, branchIndex)}
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-danger-500 hover:bg-danger-500/10"
                          >
                            حذف الخيار
                          </button>
                        </div>
                        <input
                          value={branch.keywords}
                          onChange={(e) => updateMenuBranch(index, branchIndex, { keywords: e.target.value })}
                          className="input-field mb-2 w-full !py-1.5 text-[11px]"
                          placeholder="كلمات مفتاحية مفصولة بفاصلة (مثال: تتبع, طلبي, رقم الطلب)"
                        />
                        <FlowColumn
                          steps={branch.steps}
                          path={[...path, branch.id]}
                          allowedNodeTypes={allowedNodeTypes}
                          isAllowed={isAllowed}
                          onChange={onChange}
                          onLockedType={onLockedType}
                        />
                      </div>
                    </div>
                  ))}

                  <button onClick={() => addMenuBranch(index)} className="btn-secondary w-full text-[11px]">
                    + أضف خياراً جديداً
                  </button>

                  <div className="relative">
                    <div className="pointer-events-none absolute right-3 top-6 h-px w-3 bg-white/15" />
                    <div className="rounded-lg border border-slate-500/20 bg-slate-500/5 p-2.5">
                      <p className="mb-2 text-[11px] font-medium text-slate-400">❓ رد افتراضي (لو لم يتطابق أي خيار)</p>
                      <FlowColumn
                        steps={step.elseSteps}
                        path={[...path, "else"]}
                        allowedNodeTypes={allowedNodeTypes}
                        isAllowed={isAllowed}
                        onChange={onChange}
                        onLockedType={onLockedType}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {canAddMore && (
        <div className="flex flex-wrap gap-1.5">
          {ADDABLE_TYPES.map((type) => {
            const meta = NODE_TYPES[type];
            const locked = !isAllowed(type);
            const badge = TIER_BADGE[meta.minTier];
            return (
              <button
                key={type}
                onClick={() => addStep(type)}
                className={`btn-secondary text-[11px] ${locked ? "opacity-50" : ""}`}
                title={meta.description}
              >
                + {meta.icon} {meta.label} {locked && badge ? `🔒 ${badge}` : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** خط ربط بصري بسيط (تفرّع Y) فوق عمودي "نعم/لا" لعقدة الشرط — يوضّح أن كليهما يخرجان من نفس
 * العقدة، بلا أي سحب/إفلات أو رسم بياني تفاعلي. */
function TreeForkConnector() {
  return (
    <div className="relative mb-2 h-4">
      <div className="absolute right-1/2 top-0 h-2 w-px translate-x-1/2 bg-white/15" />
      <div className="absolute right-1/4 top-2 h-2 w-px bg-white/15" />
      <div className="absolute right-3/4 top-2 h-2 w-px bg-white/15" />
      <div className="absolute right-1/4 top-2 h-px w-1/2 -translate-x-1/2 bg-white/15" />
    </div>
  );
}
