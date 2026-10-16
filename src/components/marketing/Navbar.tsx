"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronDown, Menu, MessagesSquare, X, Zap } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { LogoFull } from "@/components/Logo";
import { COMPANY_URL, COMPANY_GROUPS, PRODUCT_LINKS } from "./brand";
import { CompanyDropdownContent } from "./CompanyDropdownContent";

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const darkHeader = pathname === "/" && !scrolled;

  const cancelDropdownClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleDropdownClose = () => {
    cancelDropdownClose();
    closeTimer.current = setTimeout(() => setActiveDropdown(null), 150);
  };

  useEffect(() => {
    setActiveDropdown(null);
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".dms-nav-dropdown")) setActiveDropdown(null);
    };
    const close = () => setActiveDropdown(null);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 48);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
      if (e.key === "Tab") {
        const items = [buttonRef.current, ...Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a,button,summary") ?? [])].filter(Boolean) as HTMLElement[];
        const first = items[0]; const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    const resize = () => { if (window.innerWidth >= 1200) setOpen(false); };
    window.addEventListener("keydown", keydown);
    window.addEventListener("resize", resize);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", keydown); window.removeEventListener("resize", resize); };
  }, [open]);

  return (
    <>
      <header ref={headerRef} className={`dms-header ${darkHeader ? "dms-header-dark" : ""}`} onKeyDown={e => {
        if (e.key === "Escape" && activeDropdown) {
          headerRef.current?.querySelector<HTMLButtonElement>('.dms-dropdown-trigger[aria-expanded="true"]')?.focus();
          setActiveDropdown(null);
        }
      }}>
        <div className="dms-company-nav">
          <a href={COMPANY_URL} aria-label="الموقع الرئيسي لشركة DMS Tech"><LogoFull size="sm" /></a>
          <nav className="dms-desktop-links" aria-label="موقع DMS Tech الرئيسي">
            <a href={COMPANY_URL}>الصفحة الرئيسية</a>
            {COMPANY_GROUPS.map((group, index) => <div key={group.label} className="dms-nav-dropdown"
              onPointerEnter={event => { if (event.pointerType === "mouse") { cancelDropdownClose(); setActiveDropdown(group.label); } }}
              onPointerLeave={event => { if (event.pointerType === "mouse") scheduleDropdownClose(); }}
              onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActiveDropdown(current => current === group.label ? null : current); }}>
              <button type="button" className="dms-dropdown-trigger" aria-expanded={activeDropdown === group.label} aria-controls={`dms-company-dropdown-${index}`}
                onClick={event => { cancelDropdownClose(); setActiveDropdown(current => event.detail === 0 && current === group.label ? null : group.label); }}
                onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); cancelDropdownClose(); setActiveDropdown(group.label); requestAnimationFrame(() => document.getElementById(`dms-company-dropdown-${index}`)?.querySelector<HTMLAnchorElement>("a")?.focus()); } }}>
                {group.label}<ChevronDown size={14} aria-hidden="true" />
              </button>
              {activeDropdown === group.label && <div id={`dms-company-dropdown-${index}`} className={`dms-dropdown-panel ${index === 1 ? "dms-dropdown-mega" : ""}`} onClick={() => setActiveDropdown(null)}><CompanyDropdownContent links={group.links} mega={index === 1} /></div>}
            </div>)}
            <a href={`${COMPANY_URL}/offers`} className="dms-offers"><span className="dms-offer-badge">خصم</span><Zap size={14} />الباقات والعروض</a>
            <a href={`${COMPANY_URL}/careers`}>التوظيف</a>
            <a href={`${COMPANY_URL}/contact`}>اتصل بنا</a>
            <a href={`${COMPANY_URL}/blog`}>المدونات</a>
          </nav>
          <div className="dms-company-actions"><div className="dms-language-switch" aria-label="لغة موقع الشركة"><span aria-current="true">عربي</span><a href={`${COMPANY_URL}/en`} lang="en" aria-label="موقع الشركة باللغة الإنجليزية">EN</a></div><a className="dms-quote" href={`${COMPANY_URL}/quote`}>الحصول على عرض سعر</a><a className="dms-offers dms-mobile-offers" href={`${COMPANY_URL}/offers`}><span className="dms-offer-badge">خصم</span><Zap size={14} aria-hidden="true" />العروض</a><button ref={buttonRef} type="button" className="dms-menu-toggle" aria-label="القائمة" aria-expanded={open} aria-controls="marketing-mobile-menu" onClick={() => setOpen(v => !v)}>{open ? <X size={22} /> : <Menu size={22} />}</button></div>
        </div>
        <div className="dms-product-nav">
          <Link href="/" className="dms-product-name"><MessagesSquare size={19} /><span dir="ltr">DMS Chat Bot</span><span className="dms-product-tag">من أدوات DMS Tech</span></Link>
          <nav aria-label="التنقل داخل أداة المحادثات" className="dms-product-links">{PRODUCT_LINKS.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</Link>)}</nav>
          <div className="dms-product-actions"><ThemeToggle /><Link href="/login" className="dms-login">دخول</Link><Link href="/pricing" className="dms-start">ابدأ الآن<ArrowLeft size={14} /></Link></div>
        </div>
      </header>
      {open && <div id="marketing-mobile-menu" className="dms-mobile-panel" ref={panelRef}>
        <nav aria-label="قائمة الهاتف">
          <p className="dms-menu-label">DMS Chat Bot</p>
          {PRODUCT_LINKS.map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} aria-current={pathname === link.href ? "page" : undefined}>{link.label}<ArrowLeft size={16} /></Link>)}
          <div className="dms-mobile-account"><Link href="/login" onClick={() => setOpen(false)}>تسجيل الدخول</Link><Link href="/pricing" className="dms-start" onClick={() => setOpen(false)}>ابدأ الآن</Link></div>
          <p className="dms-menu-label">موقع الشركة</p><a href={COMPANY_URL}>الصفحة الرئيسية لـ DMS Tech<ArrowLeft size={16} /></a>
          {COMPANY_GROUPS.map(group => <details key={group.label} name="dms-mobile-company"><summary>{group.label}<ChevronDown size={16} /></summary>{group.links.map(link => <a key={link.path} href={COMPANY_URL + link.path}>{link.label}</a>)}</details>)}
          <a href={`${COMPANY_URL}/offers`}>الباقات والعروض</a><a href={`${COMPANY_URL}/contact`}>اتصل بنا</a><a href={`${COMPANY_URL}/blog`}>المدونات</a><a href={`${COMPANY_URL}/careers`}>التوظيف</a>
          <div className="dms-mobile-country"><span>المظهر</span><ThemeToggle /></div>

        </nav>
      </div>}
    </>
  );
}
