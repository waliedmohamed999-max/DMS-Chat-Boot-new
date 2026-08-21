"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

export function ReferralLinkBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  // window غير متاح وقت الرسم على الخادم — يُملأ فور التركيب في المتصفح فقط (رابط للعرض/النسخ، لا قيمة وظيفية أخرى).
  if (typeof window !== "undefined" && !origin) setOrigin(window.location.origin);

  const link = `${origin || "https://app.dms.sa"}/?ref=${code}`;

  async function copy() {
    if (await copyToClipboard(link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input readOnly value={link} dir="ltr" className="input-field flex-1 text-sm" onFocus={(e) => e.target.select()} />
      <button onClick={copy} className="btn-primary whitespace-nowrap px-4 text-sm">
        {copied ? "✓ تم النسخ" : "نسخ الرابط"}
      </button>
    </div>
  );
}
