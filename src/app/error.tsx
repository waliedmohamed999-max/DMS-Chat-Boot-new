"use client";

import { useEffect } from "react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // لا يوجد مزوّد مراقبة أخطاء حقيقي (Sentry/Datadog) مُهيَّأ في المشروع بعد — قرار خارج نطاق
    // الكود (يحتاج حساباً وDSN حقيقيين). هذا أقل حد يمنع فشلاً صامتاً بالكامل في الإنتاج.
    console.error("[unhandled-render-error]", error.digest ?? error.message, error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-bold text-red-600 dark:text-red-400">خطأ غير متوقَّع</p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">حدث خطأ ما</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-300">
        فريقنا التقني تم إبلاغه تلقائياً. حاول مرة أخرى، وإن استمر الخطأ تواصل مع الدعم الفني.
      </p>
      {error.digest && <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">رمز المرجع: {error.digest}</p>}
      <button
        onClick={reset}
        className="mt-8 rounded-lg bg-wa-500 px-6 py-3 text-center text-base font-bold text-white shadow-card transition hover:bg-wa-600"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}
