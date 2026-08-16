"use client";

import { useTransition } from "react";
import { undoImportBatch } from "./actions";

export function UndoImportButton({ batchId }: { batchId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("سيُحذَف كل جهات الاتصال الجديدة التي أضافتها هذه الدفعة تحديداً. متابعة؟")) return;
    startTransition(async () => {
      await undoImportBatch(batchId);
    });
  }

  return (
    <button onClick={handleClick} disabled={isPending} className="text-xs text-danger-500 hover:underline disabled:opacity-50">
      {isPending ? "جارٍ التراجع..." : "تراجع"}
    </button>
  );
}
