import type { FlowGraph } from "@/lib/chatbot/types";
import { createStartNode } from "@/lib/chatbot/types";

export type FlowTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** "basic" متاح لكل الباقات، "full" يتطلب الباقة الاحترافية فأعلى */
  tier: "basic" | "full";
  buildGraph: () => FlowGraph;
};

let counter = 0;
function nid() {
  counter += 1;
  return `tpl${Date.now()}_${counter}`;
}

const COL_X = 300;
const ROW_H = 140;

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "welcome_menu",
    name: "رسالة ترحيب + قائمة الأقسام",
    description: "يرحّب البوت بالعميل ويعرض له أقسام المتجر الرئيسية.",
    icon: "👋",
    tier: "basic",
    buildGraph: () => {
      const start = createStartNode({ x: COL_X, y: 40 });
      const n1 = { id: nid(), type: "message" as const, label: "أهلاً بك في متجرنا! 👋 كيف يمكننا مساعدتك اليوم؟", position: { x: COL_X, y: 40 + ROW_H } };
      const n2 = { id: nid(), type: "question" as const, label: "اختر أحد الأقسام: 1) المنتجات  2) الطلبات  3) التواصل مع فريقنا", position: { x: COL_X, y: 40 + ROW_H * 2 } };
      const n3 = { id: nid(), type: "handoff" as const, label: "تحويل لموظف لإكمال الطلب", position: { x: COL_X, y: 40 + ROW_H * 3 } };
      return {
        nodes: [start, n1, n2, n3],
        edges: [
          { id: nid(), source: start.id, target: n1.id },
          { id: nid(), source: n1.id, target: n2.id },
          { id: nid(), source: n2.id, target: n3.id },
        ],
      };
    },
  },
  {
    id: "order_status",
    name: "متابعة حالة الطلب",
    description: "يسأل البوت عن رقم الطلب ويردّ بحالته تلقائياً.",
    icon: "📦",
    tier: "basic",
    buildGraph: () => {
      const start = createStartNode({ x: COL_X, y: 40 });
      const q1 = { id: nid(), type: "question" as const, label: "من فضلك أرسل رقم طلبك لمتابعة حالته", position: { x: COL_X, y: 40 + ROW_H } };
      const cond = { id: nid(), type: "condition" as const, label: "هل يحتوي الرد على رقم طلب صحيح؟", position: { x: COL_X, y: 40 + ROW_H * 2 } };
      const yes = { id: nid(), type: "message" as const, label: "طلبك قيد الشحن 🚚 وسيصلك خلال يومين", position: { x: COL_X - 200, y: 40 + ROW_H * 3 } };
      const no = { id: nid(), type: "handoff" as const, label: "لم نتمكن من إيجاد الطلب — تحويل لموظف", position: { x: COL_X + 200, y: 40 + ROW_H * 3 } };
      return {
        nodes: [start, q1, cond, yes, no],
        edges: [
          { id: nid(), source: start.id, target: q1.id },
          { id: nid(), source: q1.id, target: cond.id },
          { id: nid(), source: cond.id, target: yes.id, sourceHandle: "true" },
          { id: nid(), source: cond.id, target: no.id, sourceHandle: "false" },
        ],
      };
    },
  },
  {
    id: "abandoned_cart",
    name: "استرجاع سلة متروكة",
    description: "يذكّر العميل بمنتجات تركها في سلته مع عرض خصم بسيط.",
    icon: "🛒",
    tier: "basic",
    buildGraph: () => {
      const start = createStartNode({ x: COL_X, y: 40 });
      const msg = { id: nid(), type: "message" as const, label: "لاحظنا أنك تركت منتجات في سلتك 🛒 أكمل طلبك الآن واحصل على خصم 10%!", position: { x: COL_X, y: 40 + ROW_H } };
      const q = { id: nid(), type: "question" as const, label: "هل ترغب في إكمال الطلب الآن؟", position: { x: COL_X, y: 40 + ROW_H * 2 } };
      const cond = { id: nid(), type: "condition" as const, label: "هل وافق العميل؟", position: { x: COL_X, y: 40 + ROW_H * 3 } };
      const yes = { id: nid(), type: "handoff" as const, label: "تحويل لموظف لإتمام الدفع", position: { x: COL_X - 200, y: 40 + ROW_H * 4 } };
      const no = { id: nid(), type: "end" as const, label: "نهاية", position: { x: COL_X + 200, y: 40 + ROW_H * 4 } };
      return {
        nodes: [start, msg, q, cond, yes, no],
        edges: [
          { id: nid(), source: start.id, target: msg.id },
          { id: nid(), source: msg.id, target: q.id },
          { id: nid(), source: q.id, target: cond.id },
          { id: nid(), source: cond.id, target: yes.id, sourceHandle: "true" },
          { id: nid(), source: cond.id, target: no.id, sourceHandle: "false" },
        ],
      };
    },
  },
  {
    id: "faq",
    name: "الرد على الأسئلة الشائعة",
    description: "رد ذكي تلقائي يجيب على أسئلة العملاء المتكررة بالاعتماد على بيانات متجرك.",
    icon: "❔",
    tier: "full",
    buildGraph: () => {
      // ai_reply نهائية دائماً في المحرك الحقيقي (تحوّل فوري لموظف بشري) — لا خطوة تُنفَّذ بعدها فعلياً.
      const start = createStartNode({ x: COL_X, y: 40 });
      const ai = { id: nid(), type: "ai_reply" as const, label: "رد ذكي على سؤال العميل", position: { x: COL_X, y: 40 + ROW_H } };
      return {
        nodes: [start, ai],
        edges: [{ id: nid(), source: start.id, target: ai.id }],
      };
    },
  },
  {
    id: "blank",
    name: "تدفق فارغ (للمستخدمين المتقدمين)",
    description: "ابدأ من الصفر وابنِ تدفقك الخاص بالكامل على لوحة الرسم.",
    icon: "🧩",
    tier: "basic",
    buildGraph: () => ({ nodes: [createStartNode()], edges: [] }),
  },
];
