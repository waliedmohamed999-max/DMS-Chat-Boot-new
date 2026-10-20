"use client";

import { useState, useTransition } from "react";
import { syncTemplatesAction } from "./actions";

/** "مزامنة من واتساب": استيراد القوالب المعتمدة في الحساب وتحديث حالة القوالب قيد المراجعة. */
export function SyncTemplatesButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await syncTemplatesAction()))} className="btn-secondary text-sm disabled:opacity-50">
        {pending ? "جارٍ المزامنة…" : "🔄 مزامنة من واتساب"}
      </button>
      {result && <span className={`text-xs ${result.ok ? "text-success-500" : "text-danger-500"}`}>{result.message}</span>}
    </div>
  );
}
