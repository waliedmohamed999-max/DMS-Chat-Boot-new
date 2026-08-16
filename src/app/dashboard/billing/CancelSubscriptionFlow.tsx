"use client";

import { useState, useTransition } from "react";
import { cancelSubscriptionAtPeriodEnd, undoCancelSubscription, pauseSubscription, resumeFromPause } from "./actions";

const REASONS = [
  "السعر مرتفع بالنسبة لي",
  "لا أستخدم المنصة بما يكفي",
  "انتقلت لأداة أخرى",
  "أغلقت نشاطي التجاري",
  "سبب آخر",
];

type Props = {
  canManage: boolean;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  pausedUntil: string | null;
};

export function CancelSubscriptionFlow({ canManage, status, cancelAtPeriodEnd, currentPeriodEnd, pausedUntil }: Props) {
  const [step, setStep] = useState<"idle" | "reason" | "retention" | "confirm">("idle");
  const [reason, setReason] = useState<string>(REASONS[0] ?? "");
  const [isPending, startTransition] = useTransition();

  if (!canManage) return null;

  if (status === "PAUSED") {
    return (
      <div className="card border border-warning-500/20 p-5">
        <p className="text-sm text-warning-500">⏸️ اشتراكك مُوقَف مؤقتاً حتى {pausedUntil ? new Date(pausedUntil).toLocaleDateString("ar-SA") : "—"}.</p>
        <button
          onClick={() => startTransition(() => resumeFromPause())}
          disabled={isPending}
          className="btn-primary mt-3 text-sm disabled:opacity-50"
        >
          استئناف الاشتراك الآن
        </button>
      </div>
    );
  }

  if (cancelAtPeriodEnd) {
    return (
      <div className="card border border-danger-500/20 p-5">
        <p className="text-sm text-danger-500">
          ⚠️ اشتراكك مجدول للإلغاء — سيتوقف وصولك في {new Date(currentPeriodEnd).toLocaleDateString("ar-SA")} (نهاية الدورة الحالية المدفوعة).
        </p>
        <button
          onClick={() => startTransition(() => undoCancelSubscription())}
          disabled={isPending}
          className="btn-primary mt-3 text-sm disabled:opacity-50"
        >
          التراجع عن الإلغاء
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5">
      {step === "idle" && (
        <button onClick={() => setStep("reason")} className="text-sm text-slate-500 hover:text-danger-500 hover:underline">
          إلغاء الاشتراك
        </button>
      )}

      {step === "reason" && (
        <div className="space-y-3">
          <h3 className="font-semibold text-white">قبل ما تروح... ليش قررت الإلغاء؟</h3>
          <div className="space-y-1.5">
            {REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm text-slate-300">
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                {r}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep("retention")} className="btn-primary text-sm">متابعة</button>
            <button onClick={() => setStep("idle")} className="btn-secondary text-sm">تراجع</button>
          </div>
        </div>
      )}

      {step === "retention" && (
        <div className="space-y-3">
          <h3 className="font-semibold text-white">قبل الإلغاء الكامل — جرّب إيقافاً مؤقتاً؟</h3>
          <p className="text-sm text-slate-400">
            يمكنك إيقاف اشتراكك لمدة 30 يوماً بدل الإلغاء الكامل — يستأنف تلقائياً بعدها، وتحتفظ ببياناتك وإعداداتك كاملة.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => startTransition(async () => { await pauseSubscription(reason); setStep("idle"); })}
              disabled={isPending}
              className="btn-primary text-sm disabled:opacity-50"
            >
              ⏸️ إيقاف مؤقت لمدة شهر
            </button>
            <button onClick={() => setStep("confirm")} className="btn-secondary text-sm">لا، أريد الإلغاء الكامل</button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-3">
          <h3 className="font-semibold text-white">تأكيد الإلغاء النهائي</h3>
          <p className="rounded-lg border border-warning-500/20 bg-warning-500/5 p-3 text-sm text-slate-300">
            سيبقى وصولك الكامل متاحاً حتى <strong dir="ltr">{new Date(currentPeriodEnd).toLocaleDateString("ar-SA")}</strong> (نهاية دورتك
            المدفوعة الحالية) — لن يتوقف الوصول فوراً.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => startTransition(async () => { await cancelSubscriptionAtPeriodEnd(reason); setStep("idle"); })}
              disabled={isPending}
              className="btn-danger text-sm disabled:opacity-50"
            >
              {isPending ? "جارٍ التنفيذ..." : "تأكيد الإلغاء"}
            </button>
            <button onClick={() => setStep("retention")} className="btn-secondary text-sm">تراجع</button>
          </div>
        </div>
      )}
    </div>
  );
}
