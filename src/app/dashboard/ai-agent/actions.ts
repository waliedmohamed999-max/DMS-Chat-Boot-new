"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/session";
import { requireEffectivePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { generateAiEmployeeReply, type ChatHistoryMessage } from "@/lib/ai/generateReply";
import { getTenantChatbotLimits, isNodeTypeAllowed } from "@/lib/planLimits";
import type { AiTone } from "@prisma/client";
import { addQa, BrainError } from "@/lib/ai/brain/ingest";

const VALID_TONES: AiTone[] = ["FORMAL", "FRIENDLY", "FUN"];

export async function updateAiAgentConfig(formData: FormData) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.edit");
  const tenantId = session.user.tenantId;

  // بوابة الباقة تُفرَض هنا أيضاً على مستوى الخادم (وليس فقط إخفاء الصفحة في الواجهة) — نفس دفاع
  // saveFlowGraph ضد التلاعب المباشر بطلب API متجاوزاً الواجهة (بند "الباقة الأساسية لا تقدر تفعّل
  // هذه الميزة" في التحقق الذاتي المطلوب).
  const limits = await getTenantChatbotLimits(tenantId);
  if (!isNodeTypeAllowed(limits, "ai_reply")) {
    throw new Error("الموظف الذكي متاح فقط من الباقة الاحترافية فأعلى — يرجى ترقية باقتك أولاً.");
  }

  const enabled = formData.get("enabled") === "on";
  const agentName = String(formData.get("agentName") ?? "").trim() || "مساعد المتجر";
  const toneRaw = String(formData.get("tone") ?? "FRIENDLY");
  const tone = VALID_TONES.includes(toneRaw as AiTone) ? (toneRaw as AiTone) : "FRIENDLY";
  const boundariesText = String(formData.get("boundariesText") ?? "").trim() || null;
  const shippingPolicy = String(formData.get("shippingPolicy") ?? "").trim() || null;
  const returnPolicy = String(formData.get("returnPolicy") ?? "").trim() || null;
  const workingHours = String(formData.get("workingHours") ?? "").trim() || null;

  await withTenant(tenantId, (tx) =>
    tx.aiAgentConfig.upsert({
      where: { tenantId },
      update: { enabled, agentName, tone, boundariesText, shippingPolicy, returnPolicy, workingHours },
      create: { tenantId, enabled, agentName, tone, boundariesText, shippingPolicy, returnPolicy, workingHours },
    })
  );

  await writeAuditLog({
    tenantId, userId: session.user.id, action: "ai_agent.config_update", targetType: "AiAgentConfig",
    metaJson: { enabled, agentName, tone },
  });

  revalidatePath("/dashboard/ai-agent");
}

export type TestMessageResult =
  | { kind: "reply"; text: string; confidence: number; answerSource: "llm" | "brain"; tokens: number; knowledgeUsed: number }
  | { kind: "handoff"; reason: string }
  | { kind: "error"; message: string };

/**
 * وضع المعاينة والاختبار (بند د في البرومنت) — يستدعي نفس محرك التوليد الحقيقي (generateAiEmployeeReply)
 * بلا أي تمثيل مزيَّف، لكن بمعرّف محادثة/جهة اتصال وهميين (لا يطابقان أي صف حقيقي) بدل إنشاء بيانات
 * اختبار حقيقية تُلوِّث قائمة جهات الاتصال أو المحادثات الفعلية للتاجر. لا كتابة إطلاقاً لـ
 * AiReplyLog/Message هنا — هذه تجربة معزولة بحتة، وليست محادثة حقيقية تُحتسَب على استهلاك الباقة
 * (باستثناء فحص حصة التوكنز نفسه، الذي يبقى مُفعَّلاً عمداً لمنع استغلال وضع الاختبار لتفادي الحد).
 */
export async function sendTestMessage(history: ChatHistoryMessage[], message: string): Promise<TestMessageResult> {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.test");
  const tenantId = session.user.tenantId;

  // نفس بوابة الباقة الخادمية المفروضة في updateAiAgentConfig — دفاع ضد استدعاء مباشر لهذا الإجراء
  // متجاوزاً صفحة /test نفسها (التي تُعيد التوجيه فقط على مستوى العرض).
  const limits = await getTenantChatbotLimits(tenantId);
  if (!isNodeTypeAllowed(limits, "ai_reply")) {
    return { kind: "error", message: "الموظف الذكي متاح فقط من الباقة الاحترافية فأعلى." };
  }

  const tenant = await withTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }));
  // السجل يأتي من المتصفح: يُقصّ (عدداً وطولاً) ويُلحق به السؤال الحالي — كان يُرسَل للنموذج بدونه فيرد على السؤال السابق.
  const text = String(message ?? "").trim().slice(0, 2000);
  if (!text) return { kind: "error", message: "اكتب رسالة" };
  const fullHistory: ChatHistoryMessage[] = [
    ...(Array.isArray(history) ? history : [])
      .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
    { role: "user", content: text },
  ];

  try {
    const result = await withTenant(tenantId, (tx) =>
      generateAiEmployeeReply({
        tx, tenantId, conversationId: "preview-test-mode", contactId: "preview-test-mode-no-contact",
        tenantName: tenant.name, history: fullHistory, lastUserText: text, realContact: false,
      })
    );
    if (result.usage?.totalTokens) {
      await withTenant(tenantId, (tx) => tx.subscription.updateMany({ where: { tenantId }, data: { aiTokensUsedThisPeriod: { increment: result.usage!.totalTokens } } }));
    }
    if (result.kind === "handoff") return { kind: "handoff", reason: result.reason };
    return {
      kind: "reply", text: result.text, confidence: result.confidence,
      answerSource: result.answerSource ?? "llm", tokens: result.usage.totalTokens, knowledgeUsed: result.knowledgeUsed ?? 0,
    };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "خطأ غير متوقع أثناء الاختبار" };
  }
}

export async function rateAiReplyLog(logId: string, rating: "HELPFUL" | "INACCURATE") {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.edit");
  const tenantId = session.user.tenantId;

  // RLS (وليس شرط where يدوي) هو من يضمن أن logId ينتمي فعلاً لهذا التاجر — صف من تاجر آخر غير مرئي
  // أصلاً ضمن هذه المعاملة، فمحاولة تحديثه تفشل بـ"لم يوجد" بدل تسريب/تعديل بيانات تاجر آخر.
  await withTenant(tenantId, (tx) => tx.aiReplyLog.update({ where: { id: logId }, data: { rating } }));

  revalidatePath("/dashboard/ai-agent/reviews");
}

export type TeachResult = { ok: boolean; message: string };

/**
 * تعليم البوت من مراجعة الجودة: سؤال العميل في هذا السجل + الجواب الصحيح ⇒ إجابة معتمدة في عقل البوت.
 * بلا answer: يُعتمد رد الموظف الذكي نفسه كما هو (رد جيد يُحفظ ليُعاد بلا توكنز).
 */
export async function teachFromReview(logId: string, answer?: string): Promise<TeachResult> {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.edit");
  const tenantId = session.user.tenantId;
  const log = await withTenant(tenantId, (tx) => tx.aiReplyLog.findUnique({ where: { id: logId }, select: { userMessage: true, aiReply: true } }));
  if (!log) return { ok: false, message: "السجل غير موجود" };
  const finalAnswer = (answer ?? log.aiReply ?? "").trim();
  try {
    await addQa(tenantId, { question: log.userMessage, answer: finalAnswer, origin: "FROM_REVIEW" });
  } catch (err) {
    return { ok: false, message: err instanceof BrainError ? err.message : "تعذّر الحفظ" };
  }
  if (answer === undefined) await withTenant(tenantId, (tx) => tx.aiReplyLog.update({ where: { id: logId }, data: { rating: "HELPFUL" } }));
  await writeAuditLog({ tenantId, userId: session.user.id, action: "ai_brain.taught_from_review", targetType: "AiReplyLog", targetId: logId });
  revalidatePath("/dashboard/ai-agent/reviews");
  return { ok: true, message: "حُفظت في عقل البوت — سيجيب بها من الآن" };
}
