import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { superAdminDb } from "@/lib/db";
import { PendingApprovalsList } from "@/components/admin/PendingApprovalsList";
import { ApprovalHistoryCard, type ApprovalHistoryItem } from "@/components/admin/ApprovalHistoryCard";
import { Pagination } from "@/components/admin/Pagination";
import type { ApprovalRequestSummary } from "@/components/admin/ApprovalCard";
import { APPROVAL_TYPE_LABELS, type ApprovalRequestTypeLabel } from "@/lib/approvalTypeLabels";

const PAGE_SIZE = 30;

function Tabs({ active }: { active: "pending" | "approved" | "rejected" }) {
  const tabs = [
    { key: "pending", label: "بانتظار المراجعة" },
    { key: "approved", label: "تم اعتمادها" },
    { key: "rejected", label: "مرفوضة" },
  ] as const;
  return (
    <div className="flex gap-2 border-b border-white/5">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`/admin/approvals?tab=${t.key}`}
          className={`px-3 py-2 text-sm ${active === t.key ? "border-b-2 border-accent-500 text-white" : "text-slate-400"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export default async function ApprovalsCenterPage({ searchParams }: { searchParams: { tab?: string; page?: string } }) {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.approvals.review")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية مراجعة الموافقات. هذه الصفحة محصورة بفريق الدعم الفني ومالك المنصة.
      </div>
    );
  }

  const tab = searchParams.tab === "approved" ? "approved" : searchParams.tab === "rejected" ? "rejected" : "pending";

  if (tab === "pending") {
    const requests = await superAdminDb.approvalRequest.findMany({
      where: { status: { in: ["PENDING", "NEEDS_INFO"] } },
      include: { tenant: { select: { id: true, name: true, slug: true, country: true } } },
      orderBy: { createdAt: "asc" },
    });

    const serialized: ApprovalRequestSummary[] = requests.map((r) => {
      // passwordHash (طلبات PARTNER_APPLICATION الحديثة) لا يُعرَض أبداً في الواجهة — يُنزَع هنا قبل
      // إرسال الـpayload للعميل، دفاع إضافي رخيص رغم أن bcrypt hash نفسه غير قابل للعكس أصلاً.
      const payload = r.payloadJson as Record<string, unknown> | null;
      const { passwordHash: _passwordHash, ...safePayload } = payload ?? {};
      return {
        id: r.id,
        type: r.type as ApprovalRequestTypeLabel,
        status: r.status as "PENDING" | "NEEDS_INFO",
        payloadJson: safePayload,
        applicantEmail: r.applicantEmail,
        reviewerNote: r.reviewerNote,
        createdAt: r.createdAt.toISOString(),
        tenant: r.tenant,
      };
    });

    const typeCounts = serialized.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1;
      return acc;
    }, {} as Partial<Record<ApprovalRequestTypeLabel, number>>);
    const breakdown = (Object.keys(typeCounts) as ApprovalRequestTypeLabel[])
      .map((t) => `${typeCounts[t]} ${APPROVAL_TYPE_LABELS[t].label}`)
      .join(" · ");

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">مركز الموافقات</h1>
          <p className="text-sm text-slate-400">
            {serialized.length > 0
              ? `${serialized.length} طلب بانتظار مراجعتك${breakdown ? ` (${breakdown})` : ""}`
              : "لا توجد طلبات بانتظار المراجعة حالياً"}
          </p>
        </div>

        <Tabs active="pending" />

        {serialized.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 p-12 text-center text-slate-500">
            <span className="text-4xl">✅</span>
            <p>كل الطلبات تمت مراجعتها. لا شيء ينتظرك الآن.</p>
          </div>
        ) : (
          <PendingApprovalsList requests={serialized} />
        )}
      </div>
    );
  }

  // تبويبا السجل التاريخي (approved/rejected) — read-only بالكامل، بلا أي أزرار قرار.
  const status = tab === "approved" ? "APPROVED" : "REJECTED";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const [historyRequests, total] = await Promise.all([
    superAdminDb.approvalRequest.findMany({
      where: { status },
      include: { tenant: { select: { id: true, name: true, slug: true } }, reviewedBy: { select: { name: true } } },
      orderBy: { reviewedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    superAdminDb.approvalRequest.count({ where: { status } }),
  ]);

  const historyItems: ApprovalHistoryItem[] = historyRequests.map((r) => {
    const payload = r.payloadJson as Record<string, unknown> | null;
    const { passwordHash: _passwordHash, ...safePayload } = payload ?? {};
    return {
      id: r.id,
      type: r.type as ApprovalRequestTypeLabel,
      status: r.status as "APPROVED" | "REJECTED",
      payloadJson: safePayload,
      applicantEmail: r.applicantEmail,
      reviewerNote: r.reviewerNote,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      reviewedByName: r.reviewedBy?.name ?? null,
      tenant: r.tenant,
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">مركز الموافقات</h1>
        <p className="text-sm text-slate-400">{tab === "approved" ? `${total} طلب مُعتمَد` : `${total} طلب مرفوض`}</p>
      </div>

      <Tabs active={tab} />

      {historyItems.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center text-slate-500">
          <p>لا يوجد سجل بعد لهذه الحالة.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {historyItems.map((r) => (
            <ApprovalHistoryCard key={r.id} request={r} />
          ))}
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} basePath="/admin/approvals" params={{ tab }} />
    </div>
  );
}
