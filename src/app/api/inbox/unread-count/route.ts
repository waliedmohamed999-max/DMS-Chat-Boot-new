import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { isPlatformRole } from "@/lib/rbac";

/**
 * نقطة خفيفة يستطلعها العميل (polling) كل بضع ثوانٍ لمعرفة وجود رسائل جديدة تستوجب رداً —
 * أساس الحد الأدنى المسموح به صراحة في البرومنت لتحديث لحظي ("Polling قصير المدى كحد أدنى")
 * وتشغيل صوت/badge إشعار عند ازدياد العدد أو تغيّر آخر رسالة.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session?.user || isPlatformRole(session.user.role) || !session.user.tenantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  const [needsReplyCount, latestMessage] = await withTenant(tenantId, async (tx) => {
    return Promise.all([
      tx.conversation.count({ where: { tenantId, status: "NEEDS_REPLY" } }),
      tx.message.findFirst({ where: { tenantId, direction: "INBOUND" }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true } }),
    ]);
  });

  return NextResponse.json({
    needsReplyCount,
    latestMessageId: latestMessage?.id ?? null,
    latestMessageAt: latestMessage?.createdAt.toISOString() ?? null,
  });
}
