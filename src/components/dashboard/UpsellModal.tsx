"use client";

import Link from "next/link";

export function UpsellModal({
  title,
  description,
  requiredTierLabel,
  onClose,
}: {
  title: string;
  description: string;
  requiredTierLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="badge bg-accent-500/10 text-accent-400">✨ {requiredTierLabel}</span>
        </div>
        <h3 className="mb-2 text-lg font-bold text-white">{title}</h3>
        <p className="mb-5 text-sm text-slate-400">{description}</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">
            لاحقاً
          </button>
          <Link href="/dashboard/billing" className="btn-primary flex-1 text-center text-sm">
            ترقية الباقة الآن
          </Link>
        </div>
      </div>
    </div>
  );
}
