"use client";

import { useState } from "react";
import { ArrowLeft, ArrowUpLeft, BadgeCheck, Bot, Check, Clock3, Info, MessagesSquare, Network, Tag, X } from "lucide-react";
import { COMPANY_WHATSAPP_PLANS } from "@/components/marketing/companyPlans";
import { COMPANY_URL } from "@/components/marketing/brand";

const number = new Intl.NumberFormat("en-SA", { maximumFractionDigits: 0 });
const PLAN_ICONS = [MessagesSquare, Bot, Network];

export function PricingClient() {
  const [annual, setAnnual] = useState(false);
  return (
    <div className="pricing-section" id="product-plans">
      <div className="dms-pricing-trust"><span><BadgeCheck size={16} />نفس باقات واتساب المنشورة لدى DMS Tech</span><a href={`${COMPANY_URL}/offers#pkg-whatsapp-automation`}>التفاصيل في الموقع الرئيسي<ArrowUpLeft size={14} /></a></div>
      <div className="pricing-toolbar"><p>الأسعار بالريال السعودي · قبل ضريبة القيمة المضافة</p><div className="pricing-period" role="group" aria-label="فترة الاشتراك"><button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>شهري</button><button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>سنوي<span className="dms-save-label">شهران مجاناً</span></button></div></div>
      <div className="pricing-grid dms-company-plans">
        {COMPANY_WHATSAPP_PLANS.map((plan, i) => {
          const Icon = PLAN_ICONS[i]!;
          return (
            <article key={plan.key} className={`pricing-card ${plan.popular ? "pricing-card-featured" : ""}`}>
              <div className="pricing-card-top"><span className="pricing-plan-mark"><Icon size={22} strokeWidth={1.75} aria-hidden="true" /></span>{plan.popular && <span className="pricing-popular">الباقة المقترحة</span>}</div>
              <h3>{plan.name}</h3><p className="dms-plan-summary">{plan.summary}</p><p className="dms-plan-audience">مناسبة: {plan.audience}</p>
              <div className="dms-plan-starting">{plan.startingFrom ? "يبدأ من" : "سعر الاشتراك"}</div>
              <div className="pricing-price"><strong dir="ltr">{number.format(annual ? plan.annualSar : plan.monthlySar)}</strong><span>ر.س<small>/ {annual ? "سنوياً" : "شهرياً"}</small></span></div>
              <p className="pricing-billing-note">{annual ? <>وفّر <bdi dir="ltr">{number.format(plan.monthlySar * 12 - plan.annualSar)}</bdi> ر.س مقارنة بالدفع الشهري</> : <>أو <bdi dir="ltr">{number.format(plan.annualSar)}</bdi> ر.س سنوياً</>}</p>
              <a href={`${COMPANY_URL}/offers/${plan.key}`} className="pricing-cta">اطلب هذه الباقة<ArrowLeft size={16} /></a>
              <div className="dms-plan-delivery"><Clock3 size={15} /><span>التنفيذ: {plan.delivery}</span></div>
              <div className="pricing-includes">ما تشمله الباقة</div><ul>{plan.features.map(feature => <li key={feature}><Check size={16} strokeWidth={1.75} aria-hidden="true" /><span>{feature}</span></li>)}</ul>
              <div className="dms-plan-exclusions"><p>غير مشمول</p><ul>{plan.exclusions.map(item => <li key={item}><X size={14} aria-hidden="true" /><span>{item}</span></li>)}</ul></div>
            </article>
          );
        })}
      </div>
      <div className="dms-pricing-notice"><Info size={18} /><p>رسوم رسائل ميتا واستخدام الذكاء الاصطناعي تُحسب حسب الاستخدام الفعلي. اعتماد الحساب والقوالب يخضع لموافقة ميتا. الأسعار قبل ضريبة القيمة المضافة <bdi dir="ltr">15%</bdi>.</p></div>
      <a className="dms-company-offer-link" href={`${COMPANY_URL}/offers`}><span className="dms-offer-link-icon"><Tag size={22} /></span><span><strong>عروض DMS Tech الحالية</strong><small>شاهد العروض الموسمية والسنوية وتفاصيل صلاحيتها في الموقع الرئيسي.</small></span><ArrowUpLeft size={20} /></a>
    </div>
  );
}
