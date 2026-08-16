"use client";

import { useEffect } from "react";

// يُستخدَم فقط عند فشل التخطيط الجذري (Root Layout) نفسه — لذلك يعرّف <html>/<body> بنفسه
// (لا يمكنه الاعتماد على layout.tsx لأنه هو نفسه من فشل).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[unhandled-root-error]", error.digest ?? error.message, error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body>
        <div style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 16px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#dc2626" }}>خطأ غير متوقَّع</p>
          <h1 style={{ marginTop: 8, fontSize: 24, fontWeight: 800 }}>حدث خطأ في تحميل الصفحة</h1>
          <p style={{ marginTop: 12, color: "#475569" }}>حاول إعادة تحميل الصفحة، وإن استمر الخطأ تواصل مع الدعم الفني.</p>
          <button
            onClick={reset}
            style={{ marginTop: 32, borderRadius: 8, background: "#22c55e", padding: "12px 24px", fontWeight: 700, color: "#fff", border: "none", cursor: "pointer" }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
