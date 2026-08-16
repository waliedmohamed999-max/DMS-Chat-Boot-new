import type { FlowGraph } from "@/lib/chatbot/types";
import { START_NODE_ID } from "@/lib/chatbot/types";

export type MediaKind = "image" | "video" | "document";

export type SimulationBubble = {
  from: "user" | "bot";
  text: string;
  link?: { url: string; text: string };
  media?: { type: MediaKind; url: string; filename?: string };
  /** true = ملاحظة تشخيصية داخلية للتاجر نفسه (تقييم شرط، تحويل صامت...) — ليست رسالة سترسل فعلياً
   * للعميل الحقيقي. لوحة الاختبار النصية تعرضها كسطر عادي، لكن معاينة الموبايل الواقعية يجب أن
   * تعرضها بشكل مختلف تماماً عن فقاعات المحادثة الحقيقية (أو تُخفيها) حتى لا تبدو كرسالة عميل وهمية. */
  diagnostic?: boolean;
};

export type ParsedMessageAttachment = {
  linkUrl?: string;
  linkText?: string;
  mediaUrl?: string;
  mediaType?: MediaKind;
  mediaFilename?: string;
};

/** يحلّل مرفق عقدة "رسالة" (إن وُجد) المخزَّن كـJSON داخل FlowNode.config — إما رابط بزر أو وسائط،
 * لا يجتمعان أبداً (نفس قيد واتساب الحقيقي، انظر lib/integrations/types.ts::MessageAttachment). */
export function parseMessageAttachment(config: string | undefined): ParsedMessageAttachment {
  if (!config) return {};
  try {
    const parsed = JSON.parse(config);
    if (parsed?.link && typeof parsed.link.url === "string" && parsed.link.url) {
      return { linkUrl: parsed.link.url, linkText: typeof parsed.link.text === "string" ? parsed.link.text : "" };
    }
    if (parsed?.media && typeof parsed.media.url === "string" && parsed.media.url) {
      const type = parsed.media.type;
      if (type === "image" || type === "video" || type === "document") {
        return {
          mediaUrl: parsed.media.url, mediaType: type,
          mediaFilename: typeof parsed.media.filename === "string" ? parsed.media.filename : undefined,
        };
      }
    }
  } catch {
    // تجاهل — config غير صالح كمرفق، يُعامَل كرسالة بلا مرفق
  }
  return {};
}

/** يجد الاتصال الخارج من عقدة معيّنة، مع مراعاة نوع المخرج (نعم/لا لعقدة شرط، أو معرّف فرع/"else" لعقدة قائمة اختيارات). */
export function findOutgoingEdge(graph: FlowGraph, nodeId: string, handle?: string) {
  return graph.edges.find((e) => e.source === nodeId && (handle === undefined ? true : (e.sourceHandle ?? null) === handle));
}

export type MenuBranchDef = { id: string; label: string; keywords: string };

/** يحلّل تعريف فروع عقدة "قائمة اختيارات" المخزَّن كـJSON داخل FlowNode.config. */
export function parseMenuBranches(config: string | undefined): MenuBranchDef[] {
  if (!config) return [];
  try {
    const parsed = JSON.parse(config);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is MenuBranchDef => !!b && typeof b.id === "string" && typeof b.label === "string" && typeof b.keywords === "string"
    );
  } catch {
    return [];
  }
}

/**
 * يطابق رد العميل ضد فروع "قائمة اختيارات" بالترتيب (أول فرع كلماته المفتاحية تظهر في الرد يفوز)،
 * ويُعيد معرّف الفرع أو "else" (الرد الافتراضي) إن لم يطابق أي فرع — نفس منطق matchesConditionKeywords
 * لكن لعدد فروع غير محدود بدل نعم/لا فقط.
 */
export function matchMenuBranch(branches: MenuBranchDef[], userMessage: string): string {
  const message = userMessage.toLowerCase();
  for (const branch of branches) {
    const keywords = branch.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (keywords.some((k) => message.includes(k))) return branch.id;
  }
  return "else";
}

/**
 * منطق تقييم عقدة "شرط" الحقيقي — مشترك بين محاكي الاختبار (هنا) والمحرك الحقيقي
 * (lib/chatbot/engine.ts) عمداً، حتى تكون تجربة "اختبار قبل النشر" مطابقة تماماً لما سيحدث فعلياً
 * مع عميل حقيقي. label العقدة = كلمات مفتاحية مفصولة بفاصلة، تُطابَق كنص جزئي غير حساس لحالة الأحرف.
 */
export function matchesConditionKeywords(label: string, userMessage: string): boolean {
  const keywords = label.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (keywords.length === 0) return false;
  const message = userMessage.toLowerCase();
  return keywords.some((k) => message.includes(k));
}

/** حالة محادثة اختبار مستمرة عبر عدة رسائل — `currentNodeId: null` يعني "لا جلسة نشطة، أي رسالة
 * تالية تبدأ من جديد"، وقيمة غير فارغة تعني "واقفون عند عقدة سؤال ننتظر رداً عليها بالذات" —
 * *بنفس بنية* `Conversation.currentNodeId` الحقيقية في `engine.ts` تماماً. */
export type SimulationSession = { currentNodeId: string | null };

export const EMPTY_SIMULATION_SESSION: SimulationSession = { currentNodeId: null };

/**
 * يقدّم محادثة اختبار خطوة تركية واحدة (تركية = دورة رسالة عميل واحدة)، **بمطابقة حرفية لبنية
 * `engine.ts`**: لا يُعاد تشغيل التدفق من الصفر مع كل رسالة — إن كانت الجلسة واقفة عند عقدة "سؤال"
 * من دورة سابقة، تُتابَع من هناك فقط (تجاوز عقدة السؤال نفسها لأنها عُرضت مسبقاً)، ورسالة العميل
 * الحالية تُقيَّم ضد أول شرط/قائمة اختيارات تُقابَلها بعدها مباشرة — تماماً كما يفعل عميل حقيقي
 * يكتب رداً بعد سؤال البوت له، بدل معاملة كل رسالة اختبار كمحادثة كاملة منفصلة من الصفر (كان هذا
 * هو الخلل الجذري وراء شكوى "بيبان عشوائي" — المحاكي القديم لم يكن يحاكي تعدد الأدوار إطلاقاً).
 */
export function advanceSimulation(
  graph: FlowGraph,
  session: SimulationSession,
  userMessage: string
): { bubbles: SimulationBubble[]; session: SimulationSession; traversal: Record<string, number> } {
  const bubbles: SimulationBubble[] = [{ from: "user", text: userMessage }];
  const traversal: Record<string, number> = {};
  const bump = (id: string) => (traversal[id] = (traversal[id] ?? 0) + 1);
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  const resumeFromId = session.currentNodeId ?? START_NODE_ID;
  let currentId: string | undefined = findOutgoingEdge(graph, resumeFromId)?.target;
  let steps = 0;

  while (currentId && steps < 25) {
    steps++;
    const node = nodesById.get(currentId);
    if (!node) break;
    bump(node.id);

    if (node.type === "message" || node.type === "question") {
      const attachment = parseMessageAttachment(node.config);
      bubbles.push({
        from: "bot", text: node.label || "…",
        link: attachment.linkUrl ? { url: attachment.linkUrl, text: attachment.linkText || attachment.linkUrl } : undefined,
        media: attachment.mediaUrl ? { type: attachment.mediaType!, url: attachment.mediaUrl, filename: attachment.mediaFilename } : undefined,
      });
      if (node.type === "question") {
        return { bubbles, session: { currentNodeId: node.id }, traversal }; // توقف — بانتظار رد العميل التالي فعلياً
      }
      currentId = findOutgoingEdge(graph, node.id)?.target;
    } else if (node.type === "handoff") {
      // مطابقة صادقة لسلوك المحرك الحقيقي: هذه العقدة لا تُرسِل أي رسالة فعلية للعميل بذاتها (تحويل
      // صامت لـcontrolMode=HUMAN) — أي رسالة يراها العميل عند التحويل يجب أن تكون خطوة "رسالة"
      // صريحة قبلها في التدفق. هذا سطر تشخيصي داخلي فقط، وليس محاكاة لرسالة حقيقية.
      bubbles.push({ from: "bot", text: "↳ تحويل صامت لموظف بشري (لا رسالة تلقائية تُرسَل للعميل هنا)", diagnostic: true });
      return { bubbles, session: EMPTY_SIMULATION_SESSION, traversal };
    } else if (node.type === "ai_reply") {
      // محاكي التدفق هذا رمزي بحت (بلا استدعاء LLM فعلي) — الموظف الذكي الآن يرد فعلياً بذكاء
      // اصطناعي حقيقي هنا (محرك الإنتاج الحقيقي في lib/chatbot/engine.ts)، وليس تحويلاً صامتاً بعد
      // الآن. لتجربة رد الموظف الذكي الفعلي، استخدم صفحة "الموظف الذكي ← جرّب موظفك" المخصَّصة لذلك.
      bubbles.push({ from: "bot", text: '↳ هنا يرد "الموظف الذكي" فعلياً بذكاء اصطناعي حقيقي (جرّبه من صفحة "الموظف الذكي")', diagnostic: true });
      return { bubbles, session: EMPTY_SIMULATION_SESSION, traversal };
    } else if (node.type === "api_call") {
      bubbles.push({ from: "bot", text: `⏳ جاري الاتصال بـ "${node.config || node.label}"... ✅ تم بنجاح`, diagnostic: true });
      currentId = findOutgoingEdge(graph, node.id)?.target;
    } else if (node.type === "condition") {
      const matched = matchesConditionKeywords(node.label, userMessage);
      bubbles.push({ from: "bot", text: `↳ تقييم "${node.label}": ${matched ? "✅ تحقق الشرط" : "❌ لم يتحقق"}`, diagnostic: true });
      currentId = findOutgoingEdge(graph, node.id, matched ? "true" : "false")?.target;
    } else if (node.type === "menu") {
      const branches = parseMenuBranches(node.config);
      const matchedId = matchMenuBranch(branches, userMessage);
      const matchedBranch = branches.find((b) => b.id === matchedId);
      bubbles.push({
        from: "bot",
        text: matchedBranch ? `↳ اختيار مطابق: "${matchedBranch.label}"` : "↳ لا يوجد اختيار مطابق — الرد الافتراضي",
        diagnostic: true,
      });
      currentId = findOutgoingEdge(graph, node.id, matchedId)?.target;
    } else if (node.type === "end") {
      return { bubbles, session: EMPTY_SIMULATION_SESSION, traversal };
    } else {
      currentId = findOutgoingEdge(graph, node.id)?.target;
    }
  }

  return { bubbles, session: EMPTY_SIMULATION_SESSION, traversal }; // نفدت المسارات — تسليم آمن (جلسة جديدة للرسالة التالية)
}

/** يبني مسار "الحالة السعيدة" (المسار الأول من كل تفرّع) لمعاينة حية دون إدخال مستخدم. */
export function buildHappyPathBubbles(graph: FlowGraph): SimulationBubble[] {
  const bubbles: SimulationBubble[] = [{ from: "user", text: "مرحباً 👋" }];
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const startNode = nodesById.has(START_NODE_ID) ? START_NODE_ID : graph.nodes[0]?.id;
  if (!startNode) return bubbles;

  let currentId: string | undefined = findOutgoingEdge(graph, startNode)?.target;
  let steps = 0;

  while (currentId && steps < 50) {
    steps++;
    const node = nodesById.get(currentId);
    if (!node) break;

    switch (node.type) {
      case "message":
      case "question": {
        const attachment = parseMessageAttachment(node.config);
        bubbles.push({
          from: "bot", text: node.label || "…",
          link: attachment.linkUrl ? { url: attachment.linkUrl, text: attachment.linkText || attachment.linkUrl } : undefined,
          media: attachment.mediaUrl ? { type: attachment.mediaType!, url: attachment.mediaUrl, filename: attachment.mediaFilename } : undefined,
        });
        currentId = findOutgoingEdge(graph, node.id)?.target;
        break;
      }
      case "ai_reply":
        // رد الموظف الذكي الفعلي ديناميكي (يعتمد على رسالة العميل الحقيقية وقت المحادثة) — لا يمكن
        // معاينته كـ"مسار سعيد" ثابت مسبقاً، فالمعاينة تتوقف هنا بصدق بدل اختلاق فقاعة نص وهمية.
        return bubbles;
      case "api_call":
        bubbles.push({ from: "bot", text: `⏳ جاري التحقق... ${node.label || ""}`, diagnostic: true });
        currentId = findOutgoingEdge(graph, node.id)?.target;
        break;
      case "condition":
        // في المعاينة (بدون إدخال فعلي) نتبع دائماً مخرج "نعم" إن وُجد، وإلا "لا"
        currentId = (findOutgoingEdge(graph, node.id, "true") ?? findOutgoingEdge(graph, node.id, "false"))?.target;
        break;
      case "menu": {
        // في المعاينة نتبع دائماً أول فرع مُعرَّف إن وُجد، وإلا الرد الافتراضي (else)
        const branches = parseMenuBranches(node.config);
        currentId = (branches.length > 0 ? findOutgoingEdge(graph, node.id, branches[0]!.id) : findOutgoingEdge(graph, node.id, "else"))?.target;
        break;
      }
      case "handoff":
        // لا رسالة حقيقية تُرسَل للعميل هنا (تحويل صامت — انظر تعليق advanceSimulation أعلاه).
        return bubbles;
      case "end":
        return bubbles;
      default:
        currentId = findOutgoingEdge(graph, node.id)?.target;
    }
  }
  return bubbles;
}
