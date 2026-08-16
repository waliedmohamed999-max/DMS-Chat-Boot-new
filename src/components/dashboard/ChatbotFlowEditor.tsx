"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { saveFlowGraph, togglePublish, recordTestRun, deleteFlow } from "@/app/dashboard/chatbot/actions";
import { NODE_TYPES, TIER_BADGE, TIER_LABELS_AR } from "@/lib/chatbot/nodeTypes";
import { WhatsAppPreview } from "@/components/dashboard/WhatsAppPreview";
import { UpsellModal } from "@/components/dashboard/UpsellModal";
import type { ChatbotNodeTypeKey } from "@/lib/planLimits";
import type { FlowGraph } from "@/lib/chatbot/types";
import { START_NODE_ID } from "@/lib/chatbot/types";
import {
  advanceSimulation,
  EMPTY_SIMULATION_SESSION,
  parseMenuBranches,
  type MenuBranchDef,
  type SimulationBubble,
  type SimulationSession,
} from "@/lib/chatbot/simulate";

let idCounter = 1000;
const ADDABLE_TYPES: ChatbotNodeTypeKey[] = ["message", "question", "condition", "menu", "ai_reply", "api_call", "handoff", "end"];

type RFNodeData = {
  nodeType: ChatbotNodeTypeKey;
  label: string;
  config?: string;
  deletable: boolean;
  onLabelChange: (id: string, value: string) => void;
  onConfigChange: (id: string, value: string) => void;
  onDelete: (id: string) => void;
};

/** بطاقة عقدة موحّدة على لوحة الرسم — بنفس أسلوب أدوات الأتمتة (n8n/Zapier): مقبض دخول أعلى،
 * محتوى قابل للتعديل مباشرة داخل البطاقة، ومقبض/مقابض خروج أسفل حسب نوع العقدة.
 * عقدة "قائمة اختيارات" (menu): محتوى فروعها (الأسماء والكلمات المفتاحية) يُحرَّر من العرض البسيط
 * فقط — هنا عرض/وصل بصري فقط (شارات + مقبض لكل فرع)، لتفادي تكرار واجهة تحرير الفروع في مكانين. */
function FlowNodeCard({ id, data }: NodeProps<Node<RFNodeData>>) {
  const meta = NODE_TYPES[data.nodeType];
  const isCondition = data.nodeType === "condition";
  const isMenu = data.nodeType === "menu";
  const isTerminal = data.nodeType === "end" || data.nodeType === "handoff";
  const hasTarget = data.nodeType !== "start";
  const menuBranches = isMenu ? parseMenuBranches(data.config) : [];
  const menuHandles = isMenu ? [...menuBranches, { id: "else", label: "غير ذلك", keywords: "" }] : [];

  return (
    <div className="w-64 rounded-xl border border-white/10 bg-navy-800 shadow-lg">
      {hasTarget && <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !bg-accent-500" />}

      <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-white/5 bg-navy-900 px-3 py-1.5">
        <span className="text-xs font-medium text-slate-300">
          {meta.icon} {meta.label}
        </span>
        {data.deletable && (
          <button
            onClick={() => data.onDelete(id)}
            className="nodrag rounded px-1.5 py-0.5 text-[10px] text-danger-500 hover:bg-danger-500/10"
          >
            حذف
          </button>
        )}
      </div>

      <div className="p-2.5">
        {data.nodeType === "start" ? (
          <p className="text-[11px] text-slate-400">{data.label}</p>
        ) : isMenu ? (
          <div className="flex flex-wrap gap-1">
            {menuBranches.length === 0 ? (
              <p className="text-[10px] text-slate-500">حرّر الخيارات من العرض البسيط</p>
            ) : (
              menuBranches.map((b, i) => (
                <span key={b.id} className="rounded bg-accent-500/10 px-1.5 py-0.5 text-[9px] text-accent-300">
                  {i + 1}. {b.label}
                </span>
              ))
            )}
          </div>
        ) : (
          <input
            value={data.label}
            onChange={(e) => data.onLabelChange(id, e.target.value)}
            className="nodrag input-field w-full !py-1.5 text-[11px]"
            placeholder={isCondition ? "كلمات مفتاحية مفصولة بفاصلة (مثال: نعم, أيوه, تمام)" : "نص الرسالة"}
          />
        )}
        {data.nodeType === "api_call" && (
          <input
            value={data.config ?? ""}
            onChange={(e) => data.onConfigChange(id, e.target.value)}
            className="nodrag input-field mt-2 w-full !py-1.5 text-[11px]"
            placeholder="رابط API (مثال: https://api.example.com/order-status)"
            dir="ltr"
          />
        )}
      </div>

      {isCondition && (
        <>
          <div className="flex justify-between border-t border-white/5 px-4 py-1 text-[10px]">
            <span className="text-success-500">✅ نعم</span>
            <span className="text-danger-500">❌ لا</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="true" style={{ left: "25%" }} className="!h-2.5 !w-2.5 !bg-success-500" />
          <Handle type="source" position={Position.Bottom} id="false" style={{ left: "75%" }} className="!h-2.5 !w-2.5 !bg-danger-500" />
        </>
      )}
      {isMenu && (
        <div className="relative border-t border-white/5 px-2 py-3">
          <div className="flex text-[9px] text-slate-400">
            {menuHandles.map((h) => (
              <span key={h.id} className="flex-1 truncate text-center">
                {h.label}
              </span>
            ))}
          </div>
          {menuHandles.map((h, i) => (
            <Handle
              key={h.id}
              type="source"
              position={Position.Bottom}
              id={h.id}
              style={{ left: `${((i + 0.5) / menuHandles.length) * 100}%` }}
              className={`!h-2.5 !w-2.5 ${h.id === "else" ? "!bg-slate-400" : "!bg-accent-500"}`}
            />
          ))}
        </div>
      )}
      {!isCondition && !isMenu && !isTerminal && (
        <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !bg-accent-500" />
      )}
    </div>
  );
}

const NODE_TYPE_KEYS: ChatbotNodeTypeKey[] = ["start", "message", "question", "condition", "menu", "ai_reply", "api_call", "handoff", "end"];
const nodeTypes: NodeTypes = Object.fromEntries(NODE_TYPE_KEYS.map((k) => [k, FlowNodeCard]));

const CARD_STYLE = { background: "transparent", border: "none", padding: 0, width: "auto" } as const;

export function ChatbotFlowEditor(props: {
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
  return (
    <ReactFlowProvider>
      <ChatbotFlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function ChatbotFlowEditorInner({
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
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [testInput, setTestInput] = useState("");
  const [testLog, setTestLog] = useState<SimulationBubble[]>([]);
  const [testSession, setTestSession] = useState<SimulationSession>(EMPTY_SIMULATION_SESSION);
  const [hasTestedThisSession, setHasTestedThisSession] = useState(initialTestRunCount > 0);
  const [lockedType, setLockedType] = useState<ChatbotNodeTypeKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAllowed = useCallback((type: ChatbotNodeTypeKey) => allowedNodeTypes.includes(type), [allowedNodeTypes]);

  const onLabelChange = useCallback((id: string, value: string) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: value } } : n)));
  }, []);
  const onConfigChange = useCallback((id: string, value: string) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, config: value } } : n)));
  }, []);
  const onDeleteNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }, []);

  const toRFNode = useCallback(
    (n: FlowGraph["nodes"][number]): Node<RFNodeData> => ({
      id: n.id,
      type: n.type,
      position: n.position,
      deletable: n.id !== START_NODE_ID,
      style: CARD_STYLE,
      data: {
        nodeType: n.type,
        label: n.label,
        config: n.config,
        deletable: n.id !== START_NODE_ID,
        onLabelChange,
        onConfigChange,
        onDelete: onDeleteNode,
      },
    }),
    [onLabelChange, onConfigChange, onDeleteNode]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<RFNodeData>>(initialGraph.nodes.map(toRFNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialGraph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      style: e.sourceHandle === "false" ? { stroke: "#ef4444" } : e.sourceHandle === "true" ? { stroke: "#22c55e" } : undefined,
    }))
  );

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => {
      const filtered = eds.filter(
        (e) => !(e.source === connection.source && (e.sourceHandle ?? null) === (connection.sourceHandle ?? null))
      );
      return addEdge({ ...connection, id: `e${idCounter++}` }, filtered);
    });
  }, [setEdges]);

  const isValidConnection = useCallback((c: Connection | Edge) => "target" in c && c.target !== START_NODE_ID, []);

  function addNode(type: ChatbotNodeTypeKey) {
    if (!isAllowed(type)) {
      setLockedType(type);
      return;
    }
    const id = `n${idCounter++}`;
    const position = { x: 60 + (nodes.length % 4) * 40, y: 460 + Math.floor(nodes.length / 4) * 40 };
    const config = type === "menu" ? JSON.stringify(defaultMenuBranches()) : undefined;
    setNodes((prev) => [
      ...prev,
      toRFNode({ id, type, label: defaultLabelFor(type), config, position }),
    ]);
  }

  const graph = useMemo<FlowGraph>(
    () => ({
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.nodeType,
        label: n.data.label,
        config: n.data.config,
        position: n.position,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
      })),
    }),
    [nodes, edges]
  );

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
          <h2 className="font-semibold text-white">لوحة رسم التدفق (عرض متقدم)</h2>
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
        <p className="mb-3 rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-xs text-accent-400">
          ℹ️ عرض للربط والتنظيم البصري. أسماء خيارات عقدة "قائمة اختيارات" وكلماتها المفتاحية تُحرَّر من
          العرض البسيط.
        </p>
        {!hasTestedThisSession && status !== "PUBLISHED" && (
          <p className="mb-3 rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-xs text-warning-500">
            ⚠️ يجب "اختبار حي" واحد على الأقل قبل تفعيل زر النشر.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {ADDABLE_TYPES.map((type) => {
            const meta = NODE_TYPES[type];
            const locked = !isAllowed(type);
            const badge = TIER_BADGE[meta.minTier];
            return (
              <button
                key={type}
                onClick={() => addNode(type)}
                className={`btn-secondary text-xs ${locked ? "opacity-50" : ""}`}
                title={meta.description}
              >
                + {meta.icon} {meta.label} {locked && badge ? `🔒 ${badge}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card overflow-hidden p-0" style={{ height: 560 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} color="#1e293b" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            position="top-right"
            className="!bg-navy-900"
            nodeColor="#334155"
            style={{ width: 130, height: 90 }}
          />
        </ReactFlow>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col items-center">
          <p className="mb-2 text-center text-xs font-medium text-slate-400">معاينة حية</p>
          <WhatsAppPreview
            graph={graph}
            storeName={storeName}
            connectedPhoneNumber={connectedPhoneNumber}
            liveLog={testLog}
            input={{ value: testInput, onChange: setTestInput, onSend: runTest }}
          />
        </div>

        <div className="card flex h-fit flex-col p-5">
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
          <div className="mb-3 max-h-80 flex-1 space-y-2 overflow-y-auto">
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

function defaultMenuBranches(): MenuBranchDef[] {
  return [
    { id: `br${idCounter++}`, label: "الخيار 1", keywords: "" },
    { id: `br${idCounter++}`, label: "الخيار 2", keywords: "" },
  ];
}

function defaultLabelFor(type: ChatbotNodeTypeKey): string {
  switch (type) {
    case "message": return "رسالة جديدة للعميل";
    case "question": return "سؤال جديد للعميل";
    case "condition": return "نعم, أيوه, تمام";
    case "menu": return "قائمة اختيارات";
    case "ai_reply": return "تحويل لموظف (لا يوجد ذكاء اصطناعي مربوط بعد)";
    case "api_call": return "استدعاء خدمة خارجية";
    case "handoff": return "تحويل لموظف بشري";
    case "end": return "نهاية التدفق";
    default: return "";
  }
}
