"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { requireEffectivePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { getTenantChatbotLimits, isNodeTypeAllowed, isUnlimited } from "@/lib/planLimits";
import { FLOW_TEMPLATES } from "@/lib/chatbot/templates";
import { PlanLimitError } from "@/lib/chatbot/errors";
import type { FlowGraph } from "@/lib/chatbot/types";

export async function createFlowFromTemplate(templateId: string, name: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.edit");

  const template = FLOW_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error("قالب غير موجود");

  const trimmedName = name.trim() || template.name;
  const limits = await getTenantChatbotLimits(session.user.tenantId);

  if (template.tier === "full" && limits.templatesTier !== "full") {
    throw new PlanLimitError(`قالب "${template.name}" متاح فقط في الباقة الاحترافية فأعلى — رقّي باقتك لاستخدامه.`);
  }

  const flowId = await withTenant(session.user.tenantId, async (tx) => {
    const currentCount = await tx.chatbotFlow.count({ where: { tenantId: session.user.tenantId } });
    if (!isUnlimited(limits.maxActiveFlows) && currentCount >= limits.maxActiveFlows) {
      throw new PlanLimitError(
        `وصلت للحد الأقصى لعدد التدفقات في باقتك الحالية (${limits.maxActiveFlows}). رقّي باقتك لإنشاء المزيد.`
      );
    }

    const flow = await tx.chatbotFlow.create({
      data: {
        tenantId: session.user.tenantId,
        name: trimmedName,
        status: "DRAFT",
        templateId: template.id,
        nodesJson: template.buildGraph() as never,
      },
    });
    return flow.id;
  });

  revalidatePath("/dashboard/chatbot");
  redirect(`/dashboard/chatbot/${flowId}`);
}

/** ينسخ تدفقاً موجوداً كمسودة جديدة — تسهيل تعديل نسخة بديلة بدل التعديل المباشر في تدفق منشور شغّال. */
export async function duplicateFlow(flowId: string) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.edit");
  const tenantId = session.user.tenantId;

  const limits = await getTenantChatbotLimits(tenantId);

  const newFlowId = await withTenant(tenantId, async (tx) => {
    const source = await tx.chatbotFlow.findUniqueOrThrow({ where: { id: flowId, tenantId } });

    const currentCount = await tx.chatbotFlow.count({ where: { tenantId } });
    if (!isUnlimited(limits.maxActiveFlows) && currentCount >= limits.maxActiveFlows) {
      throw new PlanLimitError(
        `وصلت للحد الأقصى لعدد التدفقات في باقتك الحالية (${limits.maxActiveFlows}). رقّي باقتك لإنشاء المزيد.`
      );
    }

    const copy = await tx.chatbotFlow.create({
      data: { tenantId, name: `${source.name} (نسخة)`, status: "DRAFT", nodesJson: source.nodesJson as never },
    });
    return copy.id;
  });

  await writeAuditLog({
    tenantId, userId: session.user.id, action: "chatbot.flow_duplicate", targetType: "ChatbotFlow", targetId: newFlowId,
  });

  revalidatePath("/dashboard/chatbot");
  redirect(`/dashboard/chatbot/${newFlowId}`);
}

export async function saveFlowGraph(flowId: string, graph: FlowGraph) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.edit");

  const limits = await getTenantChatbotLimits(session.user.tenantId);

  // فرض من الخادم (وليس فقط الواجهة): أي نوع عقدة غير متاح في باقة هذا التاجر يُرفض هنا حتى
  // لو تم تمريره عبر تلاعب مباشر بالـ API، وليس فقط إخفاءه بصرياً في الواجهة.
  const disallowed = graph.nodes.filter((n) => !isNodeTypeAllowed(limits, n.type));
  if (disallowed.length > 0) {
    throw new PlanLimitError(
      `نوع العقدة "${disallowed[0]!.type}" غير متاح في باقتك الحالية (${limits.planName}). رقّي باقتك لاستخدامه.`
    );
  }

  await withTenant(session.user.tenantId, async (tx) => {
    await tx.chatbotFlow.update({
      where: { id: flowId, tenantId: session.user.tenantId },
      data: { nodesJson: graph as never },
    });
  });

  revalidatePath(`/dashboard/chatbot/${flowId}`);
}

export async function recordTestRun(flowId: string, nodeTraversal: Record<string, number>) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.test");

  await withTenant(session.user.tenantId, async (tx) => {
    const flow = await tx.chatbotFlow.findUniqueOrThrow({ where: { id: flowId, tenantId: session.user.tenantId } });
    const prevTraversal = (flow.nodeTraversalJson as Record<string, number> | null) ?? {};
    const merged: Record<string, number> = { ...prevTraversal };
    for (const [nodeId, count] of Object.entries(nodeTraversal)) {
      merged[nodeId] = (merged[nodeId] ?? 0) + count;
    }

    await tx.chatbotFlow.update({
      where: { id: flowId },
      data: { testRunCount: { increment: 1 }, lastTestedAt: new Date(), nodeTraversalJson: merged as never },
    });
  });

  revalidatePath(`/dashboard/chatbot/${flowId}`);
}

export async function togglePublish(flowId: string, publish: boolean) {
  const session = await requireTenantSession();
  requireEffectivePermission(session.user.permissions, "chatbot.publish");

  await withTenant(session.user.tenantId, async (tx) => {
    const flow = await tx.chatbotFlow.findUniqueOrThrow({ where: { id: flowId, tenantId: session.user.tenantId } });

    // فرض من الخادم: لا نشر بدون اختبار حي واحد على الأقل قبله (وليس فقط تعطيل الزر بالواجهة).
    if (publish && flow.testRunCount < 1) {
      throw new Error("يجب اختبار التدفق حياً مرة واحدة على الأقل قبل النشر.");
    }

    await tx.chatbotFlow.update({
      where: { id: flowId },
      data: { status: publish ? "PUBLISHED" : "DRAFT" },
    });
  });

  await writeAuditLog({
    tenantId: session.user.tenantId, userId: session.user.id,
    action: publish ? "chatbot.publish" : "chatbot.unpublish", targetType: "ChatbotFlow", targetId: flowId,
  });

  revalidatePath(`/dashboard/chatbot/${flowId}`);
  revalidatePath("/dashboard/chatbot");
}

export async function deleteFlow(flowId: string) {
  const session = await requireTenantSession();

  const flow = await withTenant(session.user.tenantId, (tx) =>
    tx.chatbotFlow.findUniqueOrThrow({ where: { id: flowId, tenantId: session.user.tenantId } })
  );

  // المدير يقدر يحذف المسودات فقط — حذف تدفق منشور فعلياً محصور بصاحب الحساب.
  const requiredPermission = flow.status === "PUBLISHED" ? "chatbot.delete_published" : "chatbot.delete_draft";
  requireEffectivePermission(session.user.permissions, requiredPermission);

  await withTenant(session.user.tenantId, async (tx) => {
    await tx.chatbotFlow.delete({ where: { id: flowId, tenantId: session.user.tenantId } });
  });

  await writeAuditLog({
    tenantId: session.user.tenantId, userId: session.user.id,
    action: "chatbot.delete", targetType: "ChatbotFlow", targetId: flowId, metaJson: { wasPublished: flow.status === "PUBLISHED" },
  });

  revalidatePath("/dashboard/chatbot");
}
