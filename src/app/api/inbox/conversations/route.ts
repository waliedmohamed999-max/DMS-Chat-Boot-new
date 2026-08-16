import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { isPlatformRole } from "@/lib/rbac";
import { isSlaBreached } from "@/lib/inbox/conversationStatus";
import type { ConversationStatus, ConversationControlMode, Prisma } from "@prisma/client";

/**
 * قائمة المحادثات مع الفلاتر والبحث — نقطة API مستقلة (وليس Server Component) عمداً لأن
 * تخصيصات Next.js App Router لا تُمرِّر searchParams لملفات layout.tsx (فقط page.tsx)، بينما
 * قائمة المحادثات يجب أن تبقى ظاهرة بجانب أي محادثة مفتوحة — استُخدمت نقطة API يستطلعها مكوّن
 * عميل (ConversationList) عبر useSearchParams() بدل تكرار منطق الجلب في كل صفحة فرعية.
 */
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session?.user || isPlatformRole(session.user.role) || !session.user.tenantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);

  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();
  const assigneeId = searchParams.get("assigneeId");
  const controlMode = searchParams.get("controlMode");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const where: Prisma.ConversationWhereInput = { tenantId };
  if (status && status !== "ALL") where.status = status as ConversationStatus;
  if (assigneeId) where.assignedAgentId = assigneeId;
  if (controlMode) where.controlMode = controlMode as ConversationControlMode;
  if (dateFrom || dateTo) {
    where.lastMessageAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59`) } : {}),
    };
  }
  if (q) {
    where.OR = [
      { contact: { name: { contains: q, mode: "insensitive" } } },
      { contact: { phoneE164: { contains: q } } },
      { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [conversations, counts] = await withTenant(tenantId, async (tx) => {
    const list = await tx.conversation.findMany({
      where,
      include: {
        contact: true, assignedAgent: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
    });

    const grouped = await tx.conversation.groupBy({ by: ["status"], where: { tenantId }, _count: true });
    const countMap: Record<string, number> = { NEW: 0, NEEDS_REPLY: 0, OPEN: 0, RESOLVED: 0 };
    for (const g of grouped) countMap[g.status] = g._count;

    return [list, countMap];
  });

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      status: c.status,
      controlMode: c.controlMode,
      lastMessageAt: c.lastMessageAt.toISOString(),
      contact: { name: c.contact.name, phoneE164: c.contact.phoneE164 },
      lastMessageBody: c.messages[0]?.body ?? null,
      assignedAgentName: c.assignedAgent?.name ?? null,
      isSlaBreached: c.status === "NEEDS_REPLY" && isSlaBreached(c.lastMessageAt),
    })),
    counts: { ...counts, ALL: (counts.NEW ?? 0) + (counts.NEEDS_REPLY ?? 0) + (counts.OPEN ?? 0) + (counts.RESOLVED ?? 0) },
  });
}
