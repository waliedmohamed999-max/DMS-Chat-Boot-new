import { Award, Bot, Building2, CodeXml, GraduationCap, Handshake, Layers3, Megaphone, MessagesSquare, Network, PencilRuler, Route, ShoppingCart, Sparkles, Users, type LucideIcon } from "lucide-react";
import { COMPANY_URL } from "./brand";

type NavLink = { label: string; path: string };
const ICONS: Record<string, LucideIcon> = {
  "/about": Building2, "/about#values": Award, "/about#process": Route,
  "/nova-ai": Sparkles, "/dms-chat-bot": MessagesSquare,
  "/services/ai-automation": Bot, "/services/whatsapp-automation": MessagesSquare,
  "/services/web-development": CodeXml, "/services/dedicated-tech-team": Users,
  "/services/ecommerce": ShoppingCart, "/services/digital-marketing": Megaphone,
  "/services/digital-transformation": Network, "/services/ux-ui-design": PencilRuler,
  "/clients#projects": Layers3, "/clients#industries": Building2, "/clients#platforms": Handshake,
};
const DESCRIPTIONS: Record<string, string> = {
  "/about": "شريك تقني للنمو والأتمتة والتحول الرقمي",
  "/about#values": "استراتيجية وتنفيذ تقني وتركيز على النمو",
  "/about#process": "من الاكتشاف حتى الإطلاق والتحسين",
  "/nova-ai": "منصتنا الذكية للأتمتة والرؤى",
  "/dms-chat-bot": "إدارة محادثات واتساب وحملاتك من مكان واحد",
  "/clients#projects": "أعمال حقيقية نفّذناها لعملائنا",
  "/clients#industries": "تجزئة، صحة، تعليم، شركات، عقارات",
  "/clients#platforms": "المنصات التي نبني ونربط عليها",
};

export function CompanyDropdownContent({ links, mega = false }: { links: readonly NavLink[]; mega?: boolean }) {
  const rows = <div className="dms-dropdown-rows">{mega && <p className="dms-dropdown-heading">الخدمات</p>}{links.map(link => {
    const Icon = ICONS[link.path] ?? GraduationCap;
    return <a key={link.path} className={`dms-nav-row ${mega ? "dms-nav-row-compact" : ""}`} href={COMPANY_URL + link.path}>
      <span className="dms-nav-icon"><Icon size={mega ? 15 : 17} strokeWidth={1.75} aria-hidden="true" /></span>
      <span className="dms-nav-copy"><strong>{link.label}{link.path === "/nova-ai" && <span className="dms-nav-new">جديد</span>}{link.path === "/dms-chat-bot" && <span className="dms-nav-current">الأداة الحالية</span>}</strong>{!mega && DESCRIPTIONS[link.path] && <small>{DESCRIPTIONS[link.path]}</small>}</span>
    </a>;
  })}</div>;
  if (!mega) return rows;
  return <div className="dms-mega-content"><div className="dms-mega-audiences"><p className="dms-dropdown-heading">لمن نعمل</p><div className="dms-mega-audience-grid"><a href={`${COMPANY_URL}/services/ecommerce`} className="dms-audience-card dms-audience-commerce"><strong>للمتاجر الإلكترونية</strong><span><ShoppingCart size={26} strokeWidth={1.75} aria-hidden="true" /></span></a><a href={`${COMPANY_URL}/services/digital-transformation`} className="dms-audience-card dms-audience-business"><strong>للشركات والمؤسسات</strong><span><Building2 size={26} strokeWidth={1.75} aria-hidden="true" /></span></a></div></div>{rows}</div>;
}
