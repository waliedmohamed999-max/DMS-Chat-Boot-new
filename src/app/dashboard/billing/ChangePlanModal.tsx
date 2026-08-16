"use client";

import { useEffect, useState, useTransition } from "react";
import { previewPlanChange, changePlan, type PlanChangePreview } from "./actions";
import type { ComparisonPlan } from "./PlanComparison";

export function ChangePlanModal({ plan, onClose }: { plan: ComparisonPlan; onClose: () => void }) {
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [confirmResult, setConfirmResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    previewPlanChange(plan.id).then(setPreview);
  }, [plan.id]);

  function handleConfirm() {
    startTransition(async () => {
      const res = await changePlan(plan.id);
      setConfirmResult(res);
      if (res.success) setTimeout(onClose, 1200);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 font-bold text-white">تأكيد تغيير الباقة إلى {plan.name}</h3>

        {!preview && <p className="text-sm text-slate-400">جارٍ حساب التفاصيل...</p>}

        {preview && !preview.success && <p className="text-sm text-danger-500">{preview.error}</p>}

        {preview?.success && preview.blocked && (
          <div className="space-y-2">
            <p className="text-sm text-warning-500">لا يمكن التخفيض لهذه الباقة حالياً:</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-slate-300">
              {preview.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <button onClick={onClose} className="btn-secondary mt-3 w-full text-sm">إغلاق</button>
          </div>
        )}

        {preview?.success && !preview.blocked && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-white/5 bg-navy-900 p-3">
              <div className="flex justify-between"><span className="text-slate-500">أيام متبقية من الدورة الحالية</span><span dir="ltr">{preview.daysRemaining} يوم</span></div>
              <div className="flex justify-between"><span className="text-slate-500">رصيد الباقة الحالية غير المستخدم</span><span dir="ltr">{preview.creditApplied} ر.س</span></div>
              <div className="mt-2 flex justify-between border-t border-white/5 pt-2 font-bold text-white">
                <span>المبلغ المستحق الآن</span><span dir="ltr">{preview.dueNow} ر.س</span>
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>الفاتورة القادمة</span>
                <span dir="ltr">{new Date(preview.nextBillingDate).toLocaleDateString("ar-SA")} — {preview.nextBillingAmount} ر.س</span>
              </div>
            </div>

            {confirmResult && !confirmResult.success && <p className="text-xs text-danger-500">{confirmResult.error}</p>}
            {confirmResult?.success && <p className="text-xs text-success-500">✅ تم تغيير الباقة بنجاح.</p>}

            <div className="flex gap-2">
              <button onClick={handleConfirm} disabled={isPending || confirmResult?.success} className="btn-primary flex-1 text-sm disabled:opacity-50">
                {isPending ? "جارٍ التنفيذ..." : "تأكيد"}
              </button>
              <button onClick={onClose} className="btn-secondary text-sm">إلغاء</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
