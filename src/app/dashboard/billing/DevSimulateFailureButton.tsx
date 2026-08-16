"use client";

import { useTransition } from "react";
import { devSimulatePaymentFailure } from "./actions";

/** أداة اختبار Sandbox فقط — تظهر فقط عندما لا يوجد مزوّد دفع حقيقي، لمحاكاة فشل دفع والتحقق من
 * ظهور تنبيه الفشل وزر إعادة المحاولة بدون انتظار حدث فشل حقيقي من بوابة دفع. */
export function DevSimulateFailureButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(async () => { await devSimulatePaymentFailure(); })}
      disabled={isPending}
      className="text-xs text-slate-500 hover:text-warning-500 hover:underline disabled:opacity-50"
    >
      🧪 محاكاة فشل دفع (اختبار Sandbox فقط)
    </button>
  );
}
