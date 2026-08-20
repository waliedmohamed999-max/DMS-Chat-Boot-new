import { APPROVAL_TYPE_LABELS, type ApprovalRequestTypeLabel } from "@/lib/approvalTypeLabels";

export type ApprovalHistoryItem = {
  id: string;
  type: ApprovalRequestTypeLabel;
  status: "APPROVED" | "REJECTED";
  payloadJson: unknown;
  applicantEmail: string | null;
  reviewerNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  tenant: { id: string; name: string; slug: string } | null;
};

/** بطاقة سجل تاريخي للقرار — read-only بلا أي أزرار موافقة/رفض، خلافاً لـApprovalCard التفاعلية. */
export function ApprovalHistoryCard({ request }: { request: ApprovalHistoryItem }) {
  const meta = APPROVAL_TYPE_LABELS[request.type];
  const payload = (request.payloadJson ?? {}) as Record<string, string>;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.icon}</span>
          <div>
            <p className="font-semibold text-white">{request.tenant?.name ?? payload.storeName ?? "—"}</p>
            <p className="text-xs text-slate-500">
              {meta.label} · {request.tenant?.slug ?? request.applicantEmail ?? "—"}
            </p>
          </div>
        </div>
        <span className={`badge ${request.status === "APPROVED" ? "bg-success-500/10 text-success-500" : "bg-danger-500/10 text-danger-500"}`}>
          {request.status === "APPROVED" ? "✅ تم الاعتماد" : "❌ مرفوض"}
        </span>
      </div>

      {request.reviewerNote && (
        <div className="mb-3 rounded-lg bg-navy-900 p-3 text-xs text-slate-400">
          {request.status === "REJECTED" ? "سبب الرفض:" : "آخر ملاحظة:"} {request.reviewerNote}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>راجعه: {request.reviewedByName ?? "—"}</span>
        <span dir="ltr">{request.reviewedAt ? new Date(request.reviewedAt).toLocaleString("ar-SA") : "—"}</span>
      </div>
    </div>
  );
}
