import Link from "next/link";
import { BadgeCheck, ArrowUpLeft, Mail, Phone } from "lucide-react";
import { LogoFull } from "@/components/Logo";
import { COMPANY_URL, COMPANY_SERVICES } from "./brand";
import { COMPANY_CONTACT } from "@/lib/companyContact";

export function Footer() {
  return (
    <footer className="dms-footer">
      <div className="dms-footer-grid">
        <div className="dms-footer-brand">
          <a href={COMPANY_URL} aria-label="DMS Tech"><LogoFull size="md" /></a>
          <p className="dms-company-verified"><BadgeCheck size={18} />شركة سعودية مسجّلة</p>
          <p>السجل التجاري: <strong dir="ltr">7055305614</strong></p>
          <p>حلول الذكاء الاصطناعي والأتمتة والنمو الرقمي. نبني منتجات ذكية، ونؤتمت العمليات، ونسرّع نمو الأعمال.</p>
          <div className="dms-footer-social"><a href="https://instagram.com/dms1t" aria-label="Instagram"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".7" fill="currentColor" /></svg></a><a href="https://www.linkedin.com/company/dmstech-sa" aria-label="LinkedIn"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 8H2v14h3V8Zm-1.5-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM9 8v14h3v-8c0-4 6-4 6 0v8h3V13c0-6-7-6-9-3V8H9Z" /></svg></a><a href="https://x.com/dms1t" aria-label="X"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 3h4l12 18h-4L4 3Zm16 0L4 21" /></svg></a></div>
        </div>
        <div><h3>الخدمات</h3><ul>{COMPANY_SERVICES.slice(0, 6).map(link => <li key={link.path}><a href={COMPANY_URL + link.path}>{link.label}</a></li>)}</ul></div>
        <div><h3>أدواتنا ومواردنا</h3><ul><li><Link href="/">DMS Chat Bot <span className="dms-footer-badge">أنت هنا</span></Link></li><li><a href={`${COMPANY_URL}/nova-ai`}>NOVA AI</a></li><li><Link href="/pricing">باقات أداة المحادثات</Link></li><li><Link href="/affiliates">التسويق بالعمولة</Link></li><li><a href={`${COMPANY_URL}/blog`}>المدونات</a></li><li><a href={`${COMPANY_URL}/clients#platforms`}>المنصات والتكاملات</a></li></ul></div>
        <div><h3>الشركة</h3><ul><li><a href={`${COMPANY_URL}/about`}>من نحن</a></li><li><a href={`${COMPANY_URL}/clients`}>عملاؤنا</a></li><li><a href={`${COMPANY_URL}/careers`}>التوظيف</a></li><li><a href={`${COMPANY_URL}/contact`}>اتصل بنا</a></li><li><a href={`${COMPANY_URL}/quote`}>الحصول على عرض سعر</a></li></ul></div>
        <div><h3>تواصل معنا</h3><ul><li><a className="dms-contact-link" href={COMPANY_CONTACT.whatsappUrl}><Phone size={15} /><span dir="ltr">{COMPANY_CONTACT.displayPhone}</span></a></li><li><a className="dms-contact-link" href={`mailto:${COMPANY_CONTACT.email}`}><Mail size={15} /><span dir="ltr">{COMPANY_CONTACT.email}</span></a></li><li><Link href="/contact">دعم أداة المحادثات <ArrowUpLeft size={14} /></Link></li><li><Link href="/login">تسجيل الدخول</Link></li></ul></div>
      </div>
      <div className="dms-footer-bottom"><nav aria-label="روابط قانونية"><Link href="/privacy">سياسة الخصوصية</Link><Link href="/terms">الشروط والأحكام</Link><a href={COMPANY_URL}>الموقع الرئيسي<ArrowUpLeft size={13} /></a></nav><p>© {new Date().getFullYear()} DMS Tech · جميع الحقوق محفوظة.</p></div>
    </footer>
  );
}
