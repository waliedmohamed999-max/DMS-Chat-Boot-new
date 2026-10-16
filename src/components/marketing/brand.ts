export const COMPANY_URL = "https://dmstech.sa";
export const COMPANY_SERVICES = [
  { label: "الذكاء الاصطناعي والأتمتة", path: "/services/ai-automation" },
  { label: "حلول وأتمتة واتساب", path: "/services/whatsapp-automation" },
  { label: "المواقع والتطبيقات", path: "/services/web-development" },
  { label: "فريق تقني متكامل", path: "/services/dedicated-tech-team" },
  { label: "التجارة الإلكترونية", path: "/services/ecommerce" },
  { label: "التسويق والإبداع", path: "/services/digital-marketing" },
  { label: "التحول الرقمي وتكامل الأنظمة", path: "/services/digital-transformation" },
  { label: "تصميم تجربة وواجهة المستخدم", path: "/services/ux-ui-design" },
];
export const COMPANY_GROUPS = [
  { label: "من نحن", links: [
    { label: "عن DMS Tech", path: "/about" },
    { label: "لماذا تختارنا", path: "/about#values" },
    { label: "آلية العمل", path: "/about#process" },
    { label: "منصة NOVA AI", path: "/nova-ai" },
    { label: "DMS Chat Bot", path: "/dms-chat-bot" },
  ] },
  { label: "خدماتنا", links: [...COMPANY_SERVICES,
    { label: "NOVA AI", path: "/nova-ai" },
    { label: "DMS Chat Bot", path: "/dms-chat-bot" },
  ] },
  { label: "عملاؤنا", links: [
    { label: "مشاريعنا", path: "/clients#projects" },
    { label: "القطاعات التي نخدمها", path: "/clients#industries" },
    { label: "المنصات والتكاملات", path: "/clients#platforms" },
  ] },
];
export const PRODUCT_LINKS = [
  { href: "/", label: "نظرة عامة" },
  { href: "/services", label: "المزايا" },
  { href: "/pricing", label: "الباقات" },
  { href: "/affiliates", label: "التسويق بالعمولة" },
  { href: "/contact", label: "الدعم والتواصل" },
];
