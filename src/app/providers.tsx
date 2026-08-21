"use client";

import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { useCaptureReferral } from "@/lib/affiliates/useReferralCapture";

/** يستدعي useSearchParams() داخلياً — يجب أن يبقى مكوّناً منفصلاً مُغلَّفاً بـSuspense (وليس مدموجاً
 * مباشرة في Providers) وإلا فشل next build الساكن لأي صفحة لا تحتاج ديناميكية أخرى أصلاً. */
function ReferralCaptureGate() {
  useCaptureReferral();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Suspense fallback={null}>
        <ReferralCaptureGate />
      </Suspense>
      {children}
    </SessionProvider>
  );
}
