"use client";

import { signOut } from "next-auth/react";

export function PendingReviewScreen({
  status,
  reviewerNote,
  rejectionReason,
  supportEmail,
}: {
  status: "PENDING_REVIEW" | "REJECTED";
  reviewerNote?: string | null;
  rejectionReason?: string | null;
  supportEmail: string;
}) {
  const isRejected = status === "REJECTED";

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mb-4 text-5xl">{isRejected ? "❌" : "⏳"}</div>
        <h1 className="mb-2 text-lg font-bold text-white">
          {isRejected ? "تم رفض طلب التسجيل" : "حسابك بانتظار المراجعة"}
        </h1>
        <p className="mb-4 text-sm text-slate-400">
          {isRejected
            ? "لم تتم الموافقة على طلب تسجيل متجرك."
            : "يقوم فريقنا بمراجعة بيانات متجرك الآن. عادةً ما تستغرق هذه العملية وقتاً قصيراً."}
        </p>
        {reviewerNote && (
          <div className="mb-4 rounded-lg border border-warning-500/30 bg-warning-500/10 p-3 text-right text-sm text-warning-500">
            <p className="mb-1 font-medium">رسالة من فريقنا:</p>
            <p>{reviewerNote}</p>
          </div>
        )}
        {isRejected && rejectionReason && (
          <div className="mb-4 rounded-lg border border-danger-500/30 bg-danger-500/10 p-3 text-right text-sm text-danger-500">
            <p className="mb-1 font-medium">السبب:</p>
            <p>{rejectionReason}</p>
          </div>
        )}
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="btn-secondary">
          تسجيل الخروج
        </button>
        <p className="mt-4 text-xs text-slate-500">
          تحتاج مساعدة؟ راسلنا على{" "}
          <a href={`mailto:${supportEmail}`} className="text-accent-400 hover:underline" dir="ltr">
            {supportEmail}
          </a>
        </p>
      </div>
    </div>
  );
}
