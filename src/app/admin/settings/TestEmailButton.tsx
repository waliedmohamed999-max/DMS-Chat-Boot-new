"use client";

import { useState, useTransition } from "react";
import { sendTestEmail } from "./actions";

export function TestEmailButton() {
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="card max-w-2xl space-y-3 p-6">
      <div>
        <h2 className="text-sm font-bold text-white">اختبار إرسال البريد</h2>
        <p className="text-xs text-slate-400">يتحقق من إعدادات SMTP ويرسل رسالة تجريبية لبريد حسابك، ويعرض رد خادم البريد عند الفشل.</p>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => setResult(await sendTestEmail()))}
        className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
      >
        {isPending ? "جارٍ الاختبار..." : "إرسال بريد تجريبي"}
      </button>
      {result && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${result.ok ? "border-success-500/30 bg-success-500/10 text-success-500" : "border-danger-500/30 bg-danger-500/10 text-danger-500"}`}
          dir="auto"
        >
          {result.ok ? "✅ " : "❌ "}
          {result.detail}
        </div>
      )}
    </div>
  );
}
