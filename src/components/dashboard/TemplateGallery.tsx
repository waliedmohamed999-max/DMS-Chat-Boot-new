"use client";

import { useState } from "react";
import { createFlowFromTemplate } from "@/app/dashboard/chatbot/actions";
import { UpsellModal } from "@/components/dashboard/UpsellModal";

// معلومات القالب القابلة للتسلسل فقط (بدون دالة buildNodes التي تُنفَّذ حصراً على الخادم
// داخل createFlowFromTemplate) — تمرير دالة من Server Component لـ Client Component غير مسموح.
export type TemplateSummary = Pick<import("@/lib/chatbot/templates").FlowTemplate, "id" | "name" | "description" | "icon" | "tier">;

export function TemplateGallery({
  templates,
  templatesTier,
  atFlowLimit,
}: {
  templates: TemplateSummary[];
  templatesTier: "basic" | "full";
  atFlowLimit: boolean;
}) {
  const [lockedTemplate, setLockedTemplate] = useState<TemplateSummary | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const locked = t.tier === "full" && templatesTier !== "full";
          return (
            <div key={t.id} className={`card flex flex-col p-5 ${locked ? "opacity-60" : ""}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl">{t.icon}</span>
                {locked && <span className="badge bg-accent-500/10 text-accent-400">Pro</span>}
              </div>
              <h3 className="mb-1 font-semibold text-white">{t.name}</h3>
              <p className="mb-4 flex-1 text-xs text-slate-500">{t.description}</p>
              {locked ? (
                <button onClick={() => setLockedTemplate(t)} className="btn-secondary text-sm">
                  🔒 يتطلب ترقية
                </button>
              ) : atFlowLimit ? (
                <button onClick={() => setShowLimitModal(true)} className="btn-secondary text-sm">
                  استخدام هذا القالب
                </button>
              ) : (
                <form action={createFlowFromTemplate.bind(null, t.id, t.name)}>
                  <button type="submit" className="btn-primary w-full text-sm">
                    استخدام هذا القالب
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {lockedTemplate && (
        <UpsellModal
          title={`قالب "${lockedTemplate.name}" غير متاح في باقتك`}
          description="هذا القالب يعتمد على ميزات متقدمة (رد ذكي بالذكاء الاصطناعي) متاحة فقط في الباقة الاحترافية فأعلى."
          requiredTierLabel="الباقة الاحترافية"
          onClose={() => setLockedTemplate(null)}
        />
      )}
      {showLimitModal && (
        <UpsellModal
          title="وصلت للحد الأقصى لعدد التدفقات"
          description="باقتك الحالية تسمح بعدد محدود من التدفقات النشطة. رقّي باقتك لإنشاء المزيد من التدفقات دون حذف الموجود."
          requiredTierLabel="ترقية الباقة"
          onClose={() => setShowLimitModal(false)}
        />
      )}
    </>
  );
}
