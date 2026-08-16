"use client";

import { useState } from "react";
import { CopyIcon, CheckCircleIcon } from "@/components/marketing/ServiceIcons";

/** زر نسخ سريع بجانب بيانات التواصل (بريد/هاتف) — أداة صغيرة توفر على الزائر تحديد النص يدوياً. */
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // بعض المتصفحات تمنع الوصول لحافظة النظام بلا HTTPS/سياق آمن — فشل صامت غير ضار، الزر يبقى قابلاً للنقر مجدداً
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="نسخ"
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-wa-600 dark:hover:bg-white/5 dark:hover:text-wa-400"
    >
      {copied ? <CheckCircleIcon className="h-4 w-4 text-wa-500" /> : <CopyIcon className="h-4 w-4" />}
    </button>
  );
}
