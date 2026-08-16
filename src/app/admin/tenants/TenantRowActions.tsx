"use client";

import { useState, useTransition } from "react";
import { setTenantStatus, quickApproveNewTenant, quickRejectNewTenant, extendTrial, startImpersonationAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";

type Props = {
  tenantId: string;
  tenantName: string;
  status: string;
  canSuspend: boolean;
  canReview: boolean;
  canImpersonate?: boolean;
};

export function TenantRowActions({ tenantId, tenantName, status, canSuspend, canReview, canImpersonate = false }: Props) {
  const [mode, setMode] = useState<"idle" | "reject" | "extend">("idle");
  const [isPending, startTransition] = useTransition();

  if (mode === "reject") {
    return (
      <form
        action={(fd) => startTransition(async () => { await quickRejectNewTenant(tenantId, fd); setMode("idle"); })}
        className="flex items-center gap-1"
      >
        <input name="reason" required placeholder="سبب الرفض" className="input-field h-7 w-32 text-xs" />
        <button type="submit" disabled={isPending} className="text-xs text-danger-500 hover:underline disabled:opacity-50">تأكيد</button>
        <button type="button" onClick={() => setMode("idle")} className="text-xs text-slate-500 hover:underline">إلغاء</button>
      </form>
    );
  }

  if (mode === "extend") {
    return (
      <form
        action={(fd) => startTransition(async () => { await extendTrial(tenantId, parseInt(String(fd.get("days")), 10)); setMode("idle"); })}
        className="flex items-center gap-1"
      >
        <input name="days" type="number" min={1} max={90} defaultValue={7} required className="input-field h-7 w-14 text-xs" dir="ltr" />
        <button type="submit" disabled={isPending} className="text-xs text-accent-400 hover:underline disabled:opacity-50">تمديد</button>
        <button type="button" onClick={() => setMode("idle")} className="text-xs text-slate-500 hover:underline">إلغاء</button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {status === "PENDING_REVIEW" && canReview && (
        <>
          <button
            onClick={() => startTransition(() => quickApproveNewTenant(tenantId))}
            disabled={isPending}
            className="text-xs text-success-500 hover:underline disabled:opacity-50"
          >
            قبول
          </button>
          <button onClick={() => setMode("reject")} className="text-xs text-danger-500 hover:underline">رفض</button>
        </>
      )}

      {status === "TRIAL" && canSuspend && (
        <button onClick={() => setMode("extend")} className="text-xs text-accent-400 hover:underline">تمديد التجربة</button>
      )}

      {(status === "ACTIVE" || status === "TRIAL") && canSuspend && (
        <ConfirmSubmitButton
          action={() => setTenantStatus(tenantId, "SUSPENDED")}
          confirmMessage={`تعليق حساب "${tenantName}"؟ سيُمنَع كل مستخدميه من الدخول فوراً.`}
          className="text-xs text-danger-500 hover:underline"
        >
          تعليق
        </ConfirmSubmitButton>
      )}

      {status === "SUSPENDED" && canSuspend && (
        <ConfirmSubmitButton
          action={() => setTenantStatus(tenantId, "ACTIVE")}
          confirmMessage={`إعادة تفعيل حساب "${tenantName}"؟`}
          className="text-xs text-success-500 hover:underline"
        >
          إعادة تفعيل
        </ConfirmSubmitButton>
      )}

      {canImpersonate && (
        <button
          onClick={() => startTransition(() => startImpersonationAction(tenantId))}
          disabled={isPending}
          title="حصري لمالك المنصة — جلسة مؤقتة موثَّقة بالكامل في سجل التدقيق"
          className="text-xs text-accent-400 hover:underline disabled:opacity-50"
        >
          🕵️ الدخول كخبير
        </button>
      )}
    </div>
  );
}
