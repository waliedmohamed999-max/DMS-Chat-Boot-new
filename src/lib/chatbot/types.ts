import type { ChatbotNodeTypeKey } from "@/lib/planLimits";

export type FlowNode = {
  id: string;
  type: ChatbotNodeTypeKey;
  label: string;
  /** نص الشرط أو محتوى الرسالة أو رابط الـ API، حسب نوع العقدة */
  config?: string;
  /** إحداثيات العقدة على لوحة الرسم (مثل أدوات الأتمتة: n8n/Zapier) */
  position: { x: number; y: number };
};

export type FlowEdge = {
  id: string;
  source: string;
  /** لعقدة "شرط": "true"/"false". لعقدة "قائمة اختيارات" (menu): معرّف الفرع، أو "else" للرد
   * الافتراضي. بلا قيمة لبقية أنواع العقد. */
  sourceHandle?: string | null;
  target: string;
};

/** تدفق كامل = رسم بياني (عقد + اتصالات)، وليس قائمة مرتبة كما في الإصدار السابق. */
export type FlowGraph = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export const START_NODE_ID = "start";

export function createStartNode(position: { x: number; y: number } = { x: 300, y: 40 }): FlowNode {
  return { id: START_NODE_ID, type: "start", label: "عند أول رسالة من العميل", position };
}

export function emptyGraph(): FlowGraph {
  return { nodes: [createStartNode()], edges: [] };
}
