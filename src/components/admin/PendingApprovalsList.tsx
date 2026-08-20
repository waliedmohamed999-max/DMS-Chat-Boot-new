"use client";

import { useState } from "react";
import { ApprovalCard, type ApprovalRequestSummary } from "@/components/admin/ApprovalCard";
import { APPROVAL_TYPE_LABELS, type ApprovalRequestTypeLabel } from "@/lib/approvalTypeLabels";

/**
 * فلترة محلية بحتة (useState، بلا إعادة استعلام) — القائمة الكاملة تصل بالفعل serialized من
 * page.tsx، وهذا المكوّن فقط يتحكم بأيها يُعرَض. أزرار الأنواع تُبنى من الطلبات الموجودة فعلياً، فلا
 * يظهر زر لنوع بصفر طلبات أصلاً (لا حاجة لمعالجة خاصة لحالة "صفر نتائج بعد الفلترة" لنوع غير موجود).
 */
export function PendingApprovalsList({ requests }: { requests: ApprovalRequestSummary[] }) {
  const [selectedType, setSelectedType] = useState<ApprovalRequestTypeLabel | null>(null);

  const counts = requests.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<ApprovalRequestTypeLabel, number>>);

  const visible = selectedType ? requests.filter((r) => r.type === selectedType) : requests;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedType(null)}
          className={`badge transition ${selectedType === null ? "bg-accent-500/20 text-accent-400" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
        >
          الكل ({requests.length})
        </button>
        {(Object.keys(counts) as ApprovalRequestTypeLabel[]).map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`badge transition ${selectedType === type ? "bg-accent-500/20 text-accent-400" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            {APPROVAL_TYPE_LABELS[type].icon} {APPROVAL_TYPE_LABELS[type].label} ({counts[type]})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">لا توجد طلبات من هذا النوع حالياً.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visible.map((r) => (
            <ApprovalCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  );
}
