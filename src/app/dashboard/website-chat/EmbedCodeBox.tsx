"use client";

import { useState } from "react";

/** نفس نمط ReferralLinkBox بالحرف، لكن لكود iframe متعدد الأسطر بدل رابط سطر واحد. */
export function EmbedCodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // فشل الوصول لـclipboard API (صلاحيات المتصفح) — لا داعي لكسر الواجهة، المستخدم يقدر ينسخ يدوياً
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        readOnly
        value={code}
        dir="ltr"
        rows={4}
        onFocus={(e) => e.target.select()}
        className="input-field w-full font-mono text-xs"
      />
      <button onClick={copy} className="btn-primary px-4 text-sm">
        {copied ? "✓ تم النسخ" : "نسخ الكود"}
      </button>
    </div>
  );
}
