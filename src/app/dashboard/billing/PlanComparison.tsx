"use client";

import { useState } from "react";
import { ChangePlanModal } from "./ChangePlanModal";

export type ComparisonPlan = {
  id: string;
  name: string;
  priceMonthlySar: number;
  annualDiscountBps: number;
  isPopular: boolean;
  maxUsers: number;
  maxWhatsappNumbers: number;
  maxMessagesPerMonth: number;
  maxActiveFlows: number; // -1 = غير محدود
  hasAiNode: boolean;
  hasApiCallNode: boolean;
  maxCampaignsPerMonth: number; // -1 = غير محدود
  supportTier: string;
  features: string[];
};

const SUPPORT_LABELS: Record<string, string> = { email: "دعم عبر البريد", priority: "دعم ذو أولوية", dedicated: "مدير حساب مخصص" };

export function PlanComparison({ plans, currentPlanId, canManage }: { plans: ComparisonPlan[]; currentPlanId: string | null; canManage: boolean }) {
  const [annual, setAnnual] = useState(false);
  const [modalPlan, setModalPlan] = useState<ComparisonPlan | null>(null);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-white">الباقات المتاحة</h2>
        <div className="flex items-center gap-2">
          <span className={`text-sm ${!annual ? "text-white" : "text-slate-500"}`}>شهري</span>
          <button
            type="button" role="switch" aria-checked={annual} onClick={() => setAnnual((a) => !a)}
            className={`relative h-6 w-11 rounded-full transition ${annual ? "bg-accent-500" : "bg-navy-700"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${annual ? "right-0.5" : "right-[22px]"}`} />
          </button>
          <span className={`text-sm ${annual ? "text-white" : "text-slate-500"}`}>سنوي</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const discountFraction = plan.annualDiscountBps / 10000;
          const displayPrice = annual ? Math.round(plan.priceMonthlySar * (1 - discountFraction)) : plan.priceMonthlySar;
          return (
            <div key={plan.id} className={`relative card p-5 ${isCurrent ? "ring-2 ring-accent-500" : ""}`}>
              {plan.isPopular && (
                <span className="absolute -top-3 right-4 rounded-full bg-accent-500 px-3 py-1 text-xs font-bold text-white">⭐ الأكثر طلباً</span>
              )}
              <h3 className="font-bold text-white">{plan.name}</h3>
              <p className="mt-1 text-2xl font-bold text-accent-400">
                {displayPrice} <span className="text-sm font-normal text-slate-400">ر.س/شهرياً</span>
              </p>
              {annual && plan.annualDiscountBps > 0 && (
                <p className="text-xs text-success-500">وفّر {plan.annualDiscountBps / 100}% — يُفوتَر {displayPrice * 12} ر.س/سنوياً</p>
              )}
              <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5"><span className="text-success-500">✓</span> {f}</li>
                ))}
              </ul>
              {isCurrent ? (
                <div className="btn-secondary mt-4 w-full cursor-default text-center text-sm">الباقة الحالية</div>
              ) : canManage ? (
                <button onClick={() => setModalPlan(plan)} className="btn-primary mt-4 w-full text-sm">
                  {currentPlanId && plans.find((p) => p.id === currentPlanId) && plan.priceMonthlySar < (plans.find((p) => p.id === currentPlanId)?.priceMonthlySar ?? 0)
                    ? "التخفيض لهذه الباقة" : "الترقية لهذه الباقة"}
                </button>
              ) : (
                <div className="btn-secondary mt-4 w-full cursor-not-allowed text-center text-sm opacity-60" title="يتطلب صلاحية صاحب الحساب">
                  يتطلب صلاحية المالك
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-right text-xs text-slate-500">
              <th className="p-2 font-medium">الميزة</th>
              {plans.map((p) => <th key={p.id} className="p-2 font-medium text-slate-300">{p.name}</th>)}
            </tr>
          </thead>
          <tbody className="text-slate-300">
            <tr className="border-b border-white/5">
              <td className="p-2 text-slate-500">عدد الرسائل الشهرية</td>
              {plans.map((p) => <td key={p.id} dir="ltr" className="p-2">{p.maxMessagesPerMonth.toLocaleString("en-US")}</td>)}
            </tr>
            <tr className="border-b border-white/5">
              <td className="p-2 text-slate-500">عدد التدفقات/الأتمتة النشطة</td>
              {plans.map((p) => <td key={p.id} dir="ltr" className="p-2">{p.maxActiveFlows < 0 ? "غير محدود" : p.maxActiveFlows}</td>)}
            </tr>
            <tr className="border-b border-white/5">
              <td className="p-2 text-slate-500">عقدة "رد ذكي" (AI)</td>
              {plans.map((p) => <td key={p.id} className="p-2">{p.hasAiNode ? "✅" : "❌"}</td>)}
            </tr>
            <tr className="border-b border-white/5">
              <td className="p-2 text-slate-500">عقدة "استدعاء API"</td>
              {plans.map((p) => <td key={p.id} className="p-2">{p.hasApiCallNode ? "✅" : "❌"}</td>)}
            </tr>
            <tr className="border-b border-white/5">
              <td className="p-2 text-slate-500">عدد أرقام واتساب</td>
              {plans.map((p) => <td key={p.id} dir="ltr" className="p-2">{p.maxWhatsappNumbers}</td>)}
            </tr>
            <tr className="border-b border-white/5">
              <td className="p-2 text-slate-500">عدد أعضاء الفريق</td>
              {plans.map((p) => <td key={p.id} dir="ltr" className="p-2">{p.maxUsers}</td>)}
            </tr>
            <tr className="border-b border-white/5">
              <td className="p-2 text-slate-500">عدد الحملات الشهرية</td>
              {plans.map((p) => <td key={p.id} dir="ltr" className="p-2">{p.maxCampaignsPerMonth < 0 ? "غير محدود" : p.maxCampaignsPerMonth}</td>)}
            </tr>
            <tr>
              <td className="p-2 text-slate-500">مستوى الدعم</td>
              {plans.map((p) => <td key={p.id} className="p-2">{SUPPORT_LABELS[p.supportTier] ?? p.supportTier}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {modalPlan && <ChangePlanModal plan={modalPlan} onClose={() => setModalPlan(null)} />}
    </div>
  );
}
