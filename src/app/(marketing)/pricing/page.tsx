import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, MessagesSquare, SlidersHorizontal } from "lucide-react";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import "../public-pages.css";
import { PricingClient } from "./PricingClient";
import { getMarketingPlans } from "@/lib/marketingPlans";

// الباقات حقيقية وقابلة للتعديل من لوحة مالك المنصة (admin/plans) — يجب أن تُقرأ حياً وليس وقت البناء.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "الباقات والأسعار — DMS Tech",
  description: "قارن باقات منصة DMS Tech واختر الأنسب لحجم نشاطك — أسعار شفافة بلا رسوم مخفية.",
};

const FAQS = [
  { q: "هل يمكن تخصيص الباقة لنشاطي؟", a: "يمكنك طلب عرض سعر مخصص من فريق DMS Tech، ويُحدَّد النطاق والمستخدمون والتكاملات المطلوبة قبل البدء." },
  { q: "كيف أطلب الباقة أو أحصل على العرض الحالي؟", a: "اختر الباقة لزيارة صفحة طلبها في موقع DMS Tech الرئيسي. يمكنك أيضاً مراجعة صفحة العروض لمعرفة العروض الحالية وشروطها قبل إرسال الطلب." },
  { q: "هل رسوم رسائل ميتا مشمولة؟", a: "رسوم رسائل ميتا والاستخدام الإضافي للذكاء الاصطناعي تُحسب منفصلة حسب الاستخدام. تفاصيل ما تشمله كل باقة موضحة في بطاقتها وصفحة الطلب." },
  { q: "هل الأسعار تشمل ضريبة القيمة المضافة؟", a: "الأسعار المعروضة قبل الضريبة، وتُضاف ضريبة القيمة المضافة وفق الأنظمة المعمول بها عند إصدار الفاتورة." },
  { q: "متى يبدأ تنفيذ الباقة؟", a: "تبدأ المدة بعد استلام الصلاحيات والمعلومات المطلوبة واعتماد الحساب لدى ميتا. تختلف المدة حسب الباقة ونطاق العمل المعتمد." },
];

export default async function PricingPage() {
  const plans = await getMarketingPlans();
  return (
    <div className="public-offer-page">
      <header className="public-page-hero">
        <nav className="public-breadcrumb" aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><span>/</span><span aria-current="page">الباقات والأسعار</span></nav>
        <span className="public-eyebrow"><MessagesSquare size={16} aria-hidden="true" /> حلول واتساب للأعمال</span>
        <h1>خطوتك القادمة للنمو،<br /><span>تبدأ بالباقة المناسبة.</span></h1>
        <p>من أول محادثة منظّمة إلى أتمتة أعمالك بالكامل.<br className="hidden sm:block" /> اختر ما يحتاجه فريقك اليوم، وتوسّع معنا مع نمو نشاطك.</p>
        <div className="public-hero-notes"><span><Check size={16} aria-hidden="true" /> أسعار واضحة</span><span><Check size={16} aria-hidden="true" /> إعداد يناسب نشاطك</span><span><Check size={16} aria-hidden="true" /> دعم من فريق DMS Tech</span></div>
      </header>
      <div className="public-page-container">
        <PricingClient plans={plans} />
        <div className="public-custom-plan">
          <span className="public-custom-icon"><SlidersHorizontal size={26} aria-hidden="true" /></span>
          <div><h2>احتياجات أكبر؟ نصمّم الحل معك.</h2><p>فروع متعددة، فريق أكبر، أو تكاملات خاصة. نحدّد معك النطاق المناسب لأعمالك.</p></div>
          <Link href="/contact">ناقش احتياجاتك معنا <ArrowLeft size={18} aria-hidden="true" /></Link>
        </div>
        <MarketingFaq items={FAQS} title="نساعدك تختار بثقة" />
      </div>
    </div>
  );
}
