import type { ChatbotNodeTypeKey } from "@/lib/planLimits";
import { createStartNode, START_NODE_ID, type FlowGraph, type FlowNode, type FlowEdge } from "@/lib/chatbot/types";
import { findOutgoingEdge, parseMenuBranches, parseMessageAttachment, type MenuBranchDef, type MediaKind } from "@/lib/chatbot/simulate";
import { NODE_TYPES } from "@/lib/chatbot/nodeTypes";

/**
 * نموذج بناء تسلسلي (شجرة خطوات) بديل عن لوحة الرسم الحرة القديمة — كل خطوة تُنفَّذ بعد سابقتها
 * تلقائياً (بلا وصل يدوي بالماوس)، وعقدة "شرط" فقط هي التي تتفرّع لمسارين (✅/❌) كل منهما قائمة
 * مستقلة. لا رجوع/تقاطع بين الفروع — هذا القيد المتعمَّد هو ما يبسّط الترتيب والربط مقارنة بالرسم
 * الحر (الذي كان يسمح بتقاطعات ومسارات معزولة تسبب اللغبطة).
 */

export type TerminalStepType = "ai_reply" | "handoff" | "end";

/** أنواع الخطوات التي تُنهي القائمة الحالية — لا يمكن إضافة أي خطوة بعدها في نفس المسار. */
export const TERMINAL_STEP_TYPES: readonly TerminalStepType[] = ["ai_reply", "handoff", "end"];

/** مرفق اختياري لعقدة "رسالة" فقط عملياً — إما رابط بزر (linkUrl/linkText) أو وسائط
 * (mediaUrl/mediaType/mediaFilename)، لا يجتمعان أبداً (قيد حقيقي من واتساب نفسه). */
export type MessageStep = {
  id: string; type: "message" | "question"; text: string;
  linkUrl?: string; linkText?: string;
  mediaUrl?: string; mediaType?: MediaKind; mediaFilename?: string;
};
export type ApiCallStep = { id: string; type: "api_call"; text: string; apiUrl: string };
export type TerminalStep = { id: string; type: TerminalStepType };
export type ConditionStep = { id: string; type: "condition"; keywords: string; yes: BuilderStep[]; no: BuilderStep[] };
export type MenuBranch = { id: string; label: string; keywords: string; steps: BuilderStep[] };
export type MenuStep = { id: string; type: "menu"; branches: MenuBranch[]; elseSteps: BuilderStep[] };

export type BuilderStep = MessageStep | ApiCallStep | TerminalStep | ConditionStep | MenuStep;

/** "شرط" و"قائمة اختيارات" كلاهما ينهي القائمة الحالية دائماً — التفرّع نفسه هو ما "يُكمل" المسار
 * (فروع مستقلة)، وليس خطوة تالية مباشرة بنفس القائمة. */
export function isEndOfChain(step: BuilderStep | undefined): boolean {
  if (!step) return false;
  return step.type === "condition" || step.type === "menu" || (TERMINAL_STEP_TYPES as readonly string[]).includes(step.type);
}

let clientIdCounter = 0;
export function newStepId(): string {
  clientIdCounter += 1;
  return `s${Date.now().toString(36)}${clientIdCounter}`;
}

export function createStep(type: ChatbotNodeTypeKey): BuilderStep {
  const id = newStepId();
  switch (type) {
    case "message":
    case "question":
      return { id, type, text: type === "question" ? "سؤال جديد للعميل" : "رسالة جديدة للعميل" };
    case "api_call":
      return { id, type: "api_call", text: "استدعاء خدمة خارجية", apiUrl: "" };
    case "condition":
      return { id, type: "condition", keywords: "", yes: [], no: [] };
    case "menu":
      return {
        id, type: "menu",
        branches: [
          { id: newStepId(), label: "الخيار 1", keywords: "", steps: [] },
          { id: newStepId(), label: "الخيار 2", keywords: "", steps: [] },
        ],
        elseSteps: [],
      };
    case "ai_reply":
    case "handoff":
    case "end":
      return { id, type };
    default:
      throw new Error(`نوع خطوة غير مدعوم في البناء التسلسلي: ${type}`);
  }
}

/** مسار الوصول لقائمة فرعية معيّنة — سلسلة اختيارات الفروع بدءاً من الجذر (كل قائمة تحتوي عقدة
 * تفرّع واحدة كحد أقصى، ودائماً كآخر عنصر فيها، فسلسلة الاختيارات هذه كافية لتحديد القائمة بدقة).
 * لعقدة "شرط": "yes"/"no". لعقدة "قائمة اختيارات": معرّف الفرع، أو "else" للرد الافتراضي. */
export type BranchPath = string[];

export function getColumn(steps: BuilderStep[], path: BranchPath): BuilderStep[] {
  if (path.length === 0) return steps;
  const last = steps[steps.length - 1];
  if (!last) return [];
  const [head, ...rest] = path;
  if (last.type === "condition" && (head === "yes" || head === "no")) {
    return getColumn(last[head], rest);
  }
  if (last.type === "menu") {
    if (head === "else") return getColumn(last.elseSteps, rest);
    const branch = last.branches.find((b) => b.id === head);
    if (branch) return getColumn(branch.steps, rest);
  }
  return [];
}

/** عدد كل الخطوات داخل قائمة (بما فيها المتفرّعة داخل الشروط/القوائم) — لتحذير واضح قبل حذف تفرّع له خطوات. */
export function countSteps(steps: BuilderStep[]): number {
  return steps.reduce((sum, step) => {
    if (step.type === "condition") return sum + 1 + countSteps(step.yes) + countSteps(step.no);
    if (step.type === "menu") {
      return sum + 1 + step.branches.reduce((s, b) => s + countSteps(b.steps), 0) + countSteps(step.elseSteps);
    }
    return sum + 1;
  }, 0);
}

export function setColumn(steps: BuilderStep[], path: BranchPath, newColumn: BuilderStep[]): BuilderStep[] {
  if (path.length === 0) return newColumn;
  const last = steps[steps.length - 1];
  if (!last) return steps;
  const [head, ...rest] = path;
  if (last.type === "condition" && (head === "yes" || head === "no")) {
    const updatedCond: ConditionStep = { ...last, [head]: setColumn(last[head], rest, newColumn) };
    return [...steps.slice(0, -1), updatedCond];
  }
  if (last.type === "menu") {
    if (head === "else") {
      const updatedMenu: MenuStep = { ...last, elseSteps: setColumn(last.elseSteps, rest, newColumn) };
      return [...steps.slice(0, -1), updatedMenu];
    }
    const branchIndex = last.branches.findIndex((b) => b.id === head);
    if (branchIndex >= 0) {
      const updatedBranches = last.branches.map((b, i) =>
        i === branchIndex ? { ...b, steps: setColumn(b.steps, rest, newColumn) } : b
      );
      const updatedMenu: MenuStep = { ...last, branches: updatedBranches };
      return [...steps.slice(0, -1), updatedMenu];
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// FlowGraph (المخزَّن في القاعدة) ⇄ BuilderStep[] (الشكل المعروض في الواجهة الجديدة)
// ---------------------------------------------------------------------------

/** يحوّل رسماً بيانياً مخزَّناً (قديماً كان قد يُبنى بلوحة الرسم الحرة، فقد يحوي عقداً غير
 * مرتبطة فعلياً بالمسار المُنفَّذ) إلى شجرة خطوات نظيفة، متبعاً فقط ما يُنفَّذه المحرك الحقيقي
 * فعلياً بدءاً من عقدة البداية. أي عقدة لم تُزَر أثناء هذا التتبّع = ميتة فعلياً (لا تعمل أصلاً)
 * ويُبلَّغ عددها ليعرضه المستخدم كتنظيف شفاف بدل حذف صامت. */
export function graphToSteps(graph: FlowGraph): { steps: BuilderStep[]; droppedCount: number } {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>([START_NODE_ID]);

  function walkFrom(nodeId: string | undefined): BuilderStep[] {
    if (!nodeId || visited.has(nodeId)) return [];
    const node = nodesById.get(nodeId);
    if (!node) return [];
    visited.add(nodeId);

    if (node.type === "condition") {
      const yesTarget = findOutgoingEdge(graph, node.id, "true")?.target;
      const noTarget = findOutgoingEdge(graph, node.id, "false")?.target;
      const step: ConditionStep = {
        id: node.id, type: "condition", keywords: node.label,
        yes: walkFrom(yesTarget), no: walkFrom(noTarget),
      };
      return [step];
    }
    if (node.type === "menu") {
      const branchDefs = parseMenuBranches(node.config);
      const step: MenuStep = {
        id: node.id, type: "menu",
        branches: branchDefs.map((b) => ({
          id: b.id, label: b.label, keywords: b.keywords,
          steps: walkFrom(findOutgoingEdge(graph, node.id, b.id)?.target),
        })),
        elseSteps: walkFrom(findOutgoingEdge(graph, node.id, "else")?.target),
      };
      return [step];
    }
    if (node.type === "message" || node.type === "question") {
      const next = findOutgoingEdge(graph, node.id)?.target;
      const attachment = parseMessageAttachment(node.config);
      return [{ id: node.id, type: node.type, text: node.label, ...attachment }, ...walkFrom(next)];
    }
    if (node.type === "api_call") {
      const next = findOutgoingEdge(graph, node.id)?.target;
      return [{ id: node.id, type: "api_call", text: node.label, apiUrl: node.config ?? "" }, ...walkFrom(next)];
    }
    if (node.type === "ai_reply" || node.type === "handoff" || node.type === "end") {
      // نهائية فعلياً في المحرك الحقيقي — أي اتصال خارج منها (لو وُجد من بيانات قديمة) لا يُنفَّذ أبداً.
      return [{ id: node.id, type: node.type }];
    }
    // "start" أو نوع غير معروف — تجاوز والمتابعة للتالي (لا يُفترض ظهوره هنا فعلياً)
    return walkFrom(findOutgoingEdge(graph, node.id)?.target);
  }

  const steps = walkFrom(findOutgoingEdge(graph, START_NODE_ID)?.target);
  const droppedCount = graph.nodes.filter((n) => n.id !== START_NODE_ID && !visited.has(n.id)).length;
  return { steps, droppedCount };
}

const COL_X = 300;
const ROW_H = 130;
const BRANCH_DX = 220;

function toFlowNode(step: BuilderStep, position: { x: number; y: number }): FlowNode {
  switch (step.type) {
    case "message":
    case "question": {
      let config: string | undefined;
      if (step.linkUrl) {
        config = JSON.stringify({ link: { url: step.linkUrl, text: step.linkText ?? "" } });
      } else if (step.mediaUrl) {
        config = JSON.stringify({ media: { type: step.mediaType, url: step.mediaUrl, filename: step.mediaFilename } });
      }
      return { id: step.id, type: step.type, label: step.text, config, position };
    }
    case "api_call":
      return { id: step.id, type: "api_call", label: step.text, config: step.apiUrl, position };
    case "condition":
      return { id: step.id, type: "condition", label: step.keywords, position };
    case "menu": {
      const branchDefs: MenuBranchDef[] = step.branches.map((b) => ({ id: b.id, label: b.label, keywords: b.keywords }));
      return { id: step.id, type: "menu", label: NODE_TYPES.menu.label, config: JSON.stringify(branchDefs), position };
    }
    case "ai_reply":
    case "handoff":
    case "end":
      return { id: step.id, type: step.type, label: NODE_TYPES[step.type].label, position };
  }
}

/** يحوّل شجرة الخطوات لرسم بياني (FlowGraph) يفهمه المحرك الحقيقي والمحاكي دون أي تعديل عليهما —
 * الإحداثيات تُنشأ تلقائياً (لم تعد تُعرَض على أي لوحة رسم، لكنها تبقى في شكل التخزين للتوافق). */
export function stepsToGraph(steps: BuilderStep[]): FlowGraph {
  const nodes: FlowNode[] = [createStartNode({ x: COL_X, y: 40 })];
  const edges: FlowEdge[] = [];
  let edgeCounter = 0;
  const newEdgeId = () => `e${Date.now().toString(36)}${edgeCounter++}`;

  function buildColumn(columnSteps: BuilderStep[], x: number, startY: number): string | undefined {
    let prevId: string | undefined;
    let y = startY;
    let firstId: string | undefined;

    for (const step of columnSteps) {
      nodes.push(toFlowNode(step, { x, y }));
      if (prevId !== undefined) edges.push({ id: newEdgeId(), source: prevId, target: step.id });
      firstId ??= step.id;

      if (step.type === "condition") {
        const yesFirst = buildColumn(step.yes, x - BRANCH_DX, y + ROW_H);
        const noFirst = buildColumn(step.no, x + BRANCH_DX, y + ROW_H);
        if (yesFirst) edges.push({ id: newEdgeId(), source: step.id, target: yesFirst, sourceHandle: "true" });
        if (noFirst) edges.push({ id: newEdgeId(), source: step.id, target: noFirst, sourceHandle: "false" });
        return firstId; // الشرط ينهي هذا المسار دائماً — لا خطوة بعده بنفس القائمة
      }

      if (step.type === "menu") {
        const totalColumns = step.branches.length + 1; // + عمود الرد الافتراضي (else)
        const startX = x - ((totalColumns - 1) * BRANCH_DX) / 2;
        step.branches.forEach((branch, i) => {
          const branchFirst = buildColumn(branch.steps, startX + i * BRANCH_DX, y + ROW_H);
          if (branchFirst) edges.push({ id: newEdgeId(), source: step.id, target: branchFirst, sourceHandle: branch.id });
        });
        const elseFirst = buildColumn(step.elseSteps, startX + step.branches.length * BRANCH_DX, y + ROW_H);
        if (elseFirst) edges.push({ id: newEdgeId(), source: step.id, target: elseFirst, sourceHandle: "else" });
        return firstId; // القائمة تنهي هذا المسار دائماً — بديل عن تكرار الشروط المتداخلة
      }

      prevId = step.id;
      y += ROW_H;
    }
    return firstId;
  }

  const firstId = buildColumn(steps, COL_X, 40 + ROW_H);
  if (firstId) edges.push({ id: newEdgeId(), source: START_NODE_ID, target: firstId });
  return { nodes, edges };
}
