"use client";

import { useState, useTransition } from "react";
import { teachFromReview, type TeachResult } from "../actions";

/** تعليم عقل البوت من سجل مراجعة: جواب صحيح لسؤال أخطأ/حوّله، أو حفظ رد جيد كإجابة جاهزة. */
export function TeachBrain({ logId, hasReply, needsFix }: { logId: string; hasReply: boolean; needsFix: boolean }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<TeachResult | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) return <span className="text-xs text-success-500">🧠 {result.message}</span>;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-accent-400 hover:underline">
          🧠 {needsFix ? "علّم البوت الإجابة الصحيحة" : "اكتب إجابة أفضل"}
        </button>
        {hasReply && !needsFix && (
          <button type="button" disabled={pending} onClick={() => start(async () => setResult(await teachFromReview(logId)))} className="text-success-500 hover:underline disabled:opacity-50">
            ⚡ احفظ هذا الرد كإجابة جاهزة
          </button>
        )}
        {result && !result.ok && <span className="text-danger-500">{result.message}</span>}
      </div>
      {open && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => setResult(await teachFromReview(logId, answer)));
          }}
        >
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} required maxLength={2000} rows={2} className="input-field flex-1 text-sm" placeholder="الجواب الصحيح الذي كان يجب إرساله…" />
          <button disabled={pending || !answer.trim()} className="btn-primary self-start text-xs disabled:opacity-50">{pending ? "…" : "حفظ في العقل"}</button>
        </form>
      )}
    </div>
  );
}
