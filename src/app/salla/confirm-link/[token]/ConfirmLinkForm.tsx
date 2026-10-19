"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { confirmSallaLinkAction } from "./actions";

export function ConfirmLinkForm({ token }: { token: string }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-4xl">✅</div>
        <p className="text-sm text-slate-300">{result.message}</p>
        <Link href="/dashboard/integrations/salla" className="btn-primary inline-block text-sm">فتح صفحة ربط سلة</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {result && !result.ok && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">{result.message}</div>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const r = await confirmSallaLinkAction(token);
            setResult(r.ok ? { ok: true, message: `تم ربط متجر "${r.storeName}" بحسابك، والمزامنة بدأت الآن.` } : { ok: false, message: r.error });
          })
        }
        className="w-full rounded-lg bg-wa-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-600 disabled:opacity-50"
      >
        {isPending ? "جارٍ الربط..." : "تأكيد الربط"}
      </button>
      <p className="text-center text-xs text-slate-500">لو لم تطلب هذا الربط، أغلق الصفحة ببساطة — لن يحدث شيء.</p>
    </div>
  );
}
