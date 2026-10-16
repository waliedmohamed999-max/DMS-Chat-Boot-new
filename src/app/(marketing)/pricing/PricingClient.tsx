"use client";

import { useState } from "react";
import { ArrowLeft, ArrowUpLeft, BadgeCheck, Bot, Check, Clock3, Info, MessagesSquare, Network, Tag, X } from "lucide-react";
import type { MarketingPlanData } from "@/lib/marketingPlans";
import { COMPANY_URL } from "@/components/marketing/brand";
import "../public-pages.css";

const number = new Intl.NumberFormat("en-SA", { maximumFractionDigits: 0 });
const PLAN_ICONS = [MessagesSquare, Bot, Network];

export function PricingClient({ plans }: { plans: MarketingPlanData[] }) {
  const [annual, setAnnual] = useState(false);
  return (
    <div className="pricing-section" id="product-plans">
      <div className="pricing-toolbar"><div><span className="public-kicker">استثمر في تواصل أفضل</span><h2>اختر باقة أعمالك</h2><p>بالريال السعودي، قبل ضريبة القيمة المضافة</p></div><div className="pricing-period" role="group" aria-label="فترة الاشتراك"><button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>دفع شهري</button><button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>دفع سنوي</button></div></div>
      <div className="pricing-grid dms-company-plans">
        {plans.map((plan, i) => {
          const Icon = PLAN_ICONS[i % PLAN_ICONS.length]!;
          return (
            <article key={plan.key} className={`pricing-card ${plan.popular ? "pricing-card-featured" : ""}`}>
              <div className="pricing-card-heading">
                <div className="pricing-card-top"><span className="pricing-plan-mark"><Icon size={23} strokeWidth={1.6} aria-hidden="true" /></span>{plan.popular && <span className="pricing-popular"><BadgeCheck size={13} aria-hidden="true" />الباقة المقترحة</span>}</div>
                <h3>{plan.name}</h3><p className="dms-plan-summary">{plan.summary}</p>
              </div>
              <div className="pricing-cost-block">
                <div className="dms-plan-starting">{plan.startingFrom ? "يبدأ الاشتراك من" : "سعر الاشتراك"}</div>
                <div className="pricing-price"><strong dir="ltr">{number.format(annual ? plan.annualSar : plan.monthlySar)}</strong><span>ر.س<small>/ {annual ? "سنوياً" : "شهرياً"}</small></span></div>
                <p className="pricing-billing-note">{annual ? (plan.annualSar < plan.monthlySar * 12 ? <>وفّر <bdi dir="ltr">{number.format(plan.monthlySar * 12 - plan.annualSar)}</bdi> ر.س مقارنة بالدفع الشهري</> : "اشتراك سنوي") : <>أو <bdi dir="ltr">{number.format(plan.annualSar)}</bdi> ر.س سنوياً</>}</p>
                <a href={`${COMPANY_URL}/offers/${plan.key}`} className="pricing-cta">اختر {plan.name}<ArrowLeft size={16} aria-hidden="true" /></a>
                <p className="dms-plan-audience">{plan.audience}</p>
              </div>
              <div className="pricing-feature-block"><div className="pricing-includes">كل ما تحتاجه في هذه الباقة</div><ul>{plan.features.map(feature => <li key={feature}><Check size={16} strokeWidth={1.75} aria-hidden="true" /><span>{feature}</span></li>)}</ul></div>
              <div className="dms-plan-exclusions"><p>غير مشمول</p><ul>{plan.exclusions.map(item => <li key={item}><X size={14} aria-hidden="true" /><span>{item}</span></li>)}</ul></div>
              <div className="dms-plan-delivery"><Clock3 size={15} aria-hidden="true" /><span>التنفيذ: {plan.delivery}</span></div>
            </article>
          );
        })}
      </div>
      {plans.length === 0 && <p className="py-12 text-center">لا توجد باقات متاحة حالياً. تواصل معنا للحصول على عرض سعر.</p>}
      <div className="dms-pricing-notice"><Info size={18} /><p>رسوم رسائل ميتا واستخدام الذكاء الاصطناعي تُحسب حسب الاستخدام الفعلي. اعتماد الحساب والقوالب يخضع لموافقة ميتا. الأسعار قبل ضريبة القيمة المضافة <bdi dir="ltr">15%</bdi>.</p></div>
      <a className="dms-company-offer-link" href={`${COMPANY_URL}/offers`}><span className="dms-offer-link-icon"><Tag size={22} /></span><span><strong>عروض DMS Tech الحالية</strong><small>شاهد العروض الموسمية والسنوية وتفاصيل صلاحيتها في الموقع الرئيسي.</small></span><ArrowUpLeft size={20} /></a>
    </div>
  );
}
