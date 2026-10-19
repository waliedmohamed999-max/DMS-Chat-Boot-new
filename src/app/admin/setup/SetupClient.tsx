"use client";

import { useState, useTransition } from "react";
import { testSetupConnection, type TestResult } from "./actions";

export function TestConnectionButton({ kind }: { kind: "core" | "d360" | "moyasar" }) {
  const [result, setResult] = useState<TestResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await testSetupConnection(kind)))}
        className="btn-secondary text-xs disabled:opacity-50"
      >
        {pending ? "جارٍ الاختبار…" : "اختبار الاتصال"}
      </button>
      {result && <span className={`text-xs ${result.ok ? "text-success-500" : "text-danger-500"}`}>{result.detail}</span>}
    </div>
  );
}

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-400">{label}</p>
      <div className="flex items-center gap-2">
        <code dir="ltr" className="flex-1 truncate rounded bg-black/30 px-2 py-1 text-xs text-slate-200">{value}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // حافظة غير متاحة (سياق غير آمن) — النسخ اليدوي ممكن من الحقل
            }
          }}
          className="btn-secondary px-2 py-1 text-xs"
        >
          {copied ? "✓" : "نسخ"}
        </button>
      </div>
    </div>
  );
}
