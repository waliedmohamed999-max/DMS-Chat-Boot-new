"use client";

import { useState, useTransition } from "react";
import {
  approveNewTenant,
  approveWhatsappVerification,
  approveCustomPlan,
  approveMessageTemplate,
  approvePartnerApplication,
  rejectRequest,
  requestMoreInfo,
} from "@/app/admin/approvals/actions";
import { COUNTRY_TO_CURRENCY, CURRENCY_SYMBOLS } from "@/lib/currency";
import { APPROVAL_TYPE_LABELS, type ApprovalRequestTypeLabel } from "@/lib/approvalTypeLabels";
import { timeSinceAr } from "@/lib/timeSinceAr";

export type ApprovalRequestSummary = {
  id: string;
  type: ApprovalRequestTypeLabel;
  status: "PENDING" | "NEEDS_INFO";
  payloadJson: unknown;
  applicantEmail: string | null;
  reviewerNote: string | null;
  createdAt: string;
  tenant: { id: string; name: string; slug: string; country: "SA" | "AE" | "EG" } | null;
};

export function ApprovalCard({ request }: { request: ApprovalRequestSummary }) {
  const [mode, setMode] = useState<"idle" | "reject" | "info" | "custom_plan">("idle");
  const [isPending, startTransition] = useTransition();
  const meta = APPROVAL_TYPE_LABELS[request.type];
  const payload = (request.payloadJson ?? {}) as Record<string, string>;
  const waitingHours = (Date.now() - new Date(request.createdAt).getTime()) / (3600 * 1000);
  const isOverdue = waitingHours > 48;

  function approve() {
    startTransition(async () => {
      if (request.type === "NEW_TENANT") await approveNewTenant(request.id);
      if (request.type === "WHATSAPP_VERIFICATION") await approveWhatsappVerification(request.id);
      if (request.type === "MESSAGE_TEMPLATE") await approveMessageTemplate(request.id);
      if (request.type === "PARTNER_APPLICATION") await approvePartnerApplication(request.id);
    });
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.icon}</span>
          <div>
            <p className="font-semibold text-white">{request.tenant?.name ?? payload.storeName ?? "—"}</p>
            <p className="text-xs text-slate-500">
              {meta.label} · {request.tenant?.slug ?? request.applicantEmail ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {request.status === "NEEDS_INFO" && (
            <span className="badge bg-warning-500/10 text-warning-500">بانتظار رد التاجر</span>
          )}
          <span className={`text-xs ${isOverdue ? "font-medium text-danger-500" : "text-slate-500"}`}>
            {isOverdue && "⚠️ "}
            {timeSinceAr(request.createdAt)}
          </span>
        </div>
      </div>

      {request.type === "NEW_TENANT" && (
        <div className="mb-3 rounded-lg bg-navy-900 p-3 text-sm text-slate-300">
          <p><span className="text-slate-500">النشاط التجاري:</span> {payload.businessActivity ?? "—"}</p>
          <p><span className="text-slate-500">الباقة المطلوبة:</span> {payload.requestedPlanKey ?? "—"}</p>
        </div>
      )}
      {request.type === "WHATSAPP_VERIFICATION" && (
        <div className="mb-3 rounded-lg bg-navy-900 p-3 text-sm text-slate-300" dir="ltr">
          <p>Phone Number ID: {payload.phoneNumberId ?? "—"}</p>
        </div>
      )}
      {request.type === "MESSAGE_TEMPLATE" && (
        <div className="mb-3 rounded-lg bg-navy-900 p-3 text-sm text-slate-300">
          <p dir="ltr"><span className="text-slate-500">الاسم:</span> {payload.name ?? "—"}</p>
          <p><span className="text-slate-500">النوع:</span> {payload.category ?? "—"}</p>
          <p className="mt-1 text-slate-400">{payload.bodyText ?? "—"}</p>
        </div>
      )}
      {request.type === "CUSTOM_PLAN" && (
        <div className="mb-3 rounded-lg bg-navy-900 p-3 text-sm text-slate-300">
          <p className="text-slate-500">وصف احتياج التاجر:</p>
          <p className="mt-1">{payload.details ?? "—"}</p>
        </div>
      )}
      {request.type === "PARTNER_APPLICATION" && (
        <div className="mb-3 rounded-lg bg-navy-900 p-3 text-sm text-slate-300">
          <p><span className="text-slate-500">صاحب الطلب:</span> {payload.ownerName ?? "—"} (<span dir="ltr">{request.applicantEmail ?? "—"}</span>)</p>
          <p><span className="text-slate-500">نوع النشاط:</span> {payload.activityType ?? "—"}</p>
          <p><span className="text-slate-500">الهاتف:</span> <span dir="ltr">{payload.phone ?? "—"}</span></p>
          <p><span className="text-slate-500">المدينة:</span> {payload.city ?? "—"}</p>
          <p><span className="text-slate-500">الباقة المطلوبة:</span> {payload.requestedPlanName ?? payload.requestedPlanKey ?? "—"}</p>
        </div>
      )}
      {request.reviewerNote && request.status === "NEEDS_INFO" && (
        <div className="mb-3 rounded-lg border border-warning-500/20 bg-warning-500/5 p-3 text-xs text-slate-400">
          آخر رسالة أُرسلت للتاجر: {request.reviewerNote}
        </div>
      )}

      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          {request.type === "CUSTOM_PLAN" ? (
            <button onClick={() => setMode("custom_plan")} className="btn-primary text-xs">
              إعداد الباقة المخصصة
            </button>
          ) : (
            <button onClick={approve} disabled={isPending} className="btn-primary text-xs">
              ✅ قبول وتفعيل
            </button>
          )}
          <button onClick={() => setMode("info")} className="btn-secondary text-xs">
            طلب معلومات إضافية
          </button>
          <button onClick={() => setMode("reject")} className="btn-danger text-xs">
            رفض
          </button>
        </div>
      )}

      {mode === "reject" && (
        <form
          action={(fd) => startTransition(async () => { await rejectRequest(request.id, fd); setMode("idle"); })}
          className="space-y-2"
        >
          <textarea name="reason" required placeholder="سبب الرفض (يظهر للتاجر)" className="input-field text-sm" rows={2} />
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn-danger text-xs">تأكيد الرفض</button>
            <button type="button" onClick={() => setMode("idle")} className="btn-secondary text-xs">إلغاء</button>
          </div>
        </form>
      )}

      {mode === "info" && (
        <form
          action={(fd) => startTransition(async () => { await requestMoreInfo(request.id, fd); setMode("idle"); })}
          className="space-y-2"
        >
          <textarea name="message" required placeholder="ما المعلومات المطلوبة من التاجر؟" className="input-field text-sm" rows={2} />
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn-primary text-xs">إرسال الطلب</button>
            <button type="button" onClick={() => setMode("idle")} className="btn-secondary text-xs">إلغاء</button>
          </div>
        </form>
      )}

      {mode === "custom_plan" && (
        <form
          action={(fd) => startTransition(async () => { await approveCustomPlan(request.id, fd); setMode("idle"); })}
          className="space-y-2"
        >
          <div className="grid grid-cols-2 gap-2">
            <input name="planName" required placeholder="اسم الباقة" className="input-field text-sm" />
            <input
              name="price"
              type="number"
              required
              placeholder={`السعر (${CURRENCY_SYMBOLS[COUNTRY_TO_CURRENCY[request.tenant?.country ?? "SA"]]})`}
              className="input-field text-sm"
              dir="ltr"
            />
            <input name="maxUsers" type="number" required placeholder="أقصى مستخدمين" className="input-field text-sm" dir="ltr" />
            <input name="maxWhatsappNumbers" type="number" required placeholder="أقصى أرقام واتساب" className="input-field text-sm" dir="ltr" />
            <input name="maxMessagesPerMonth" type="number" required placeholder="أقصى رسائل شهرياً" className="input-field text-sm col-span-2" dir="ltr" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn-primary text-xs">اعتماد وتفعيل</button>
            <button type="button" onClick={() => setMode("idle")} className="btn-secondary text-xs">إلغاء</button>
          </div>
        </form>
      )}
    </div>
  );
}
