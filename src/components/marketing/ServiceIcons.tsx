/**
 * أيقونات SVG مرسومة مخصَّصة (بدل الإيموجي) لكل خدمة — مظهر احترافي متسق عبر كل المتصفحات وأنظمة
 * التشغيل (الإيموجي يختلف شكله فعلياً بين Windows/macOS/Android وقد يبدو غير احترافي في موقع تسويقي).
 * كل أيقونة بخط بسيط (stroke) بلون currentColor لتتوارث لون النص المحيط بها مباشرة.
 */
type IconProps = { className?: string };

export function CampaignIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3 11v2a2 2 0 0 0 2 2h1l2 5h2l-1.5-5H9l9 4V5l-9 4H5a2 2 0 0 0-2 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M18 9.5a3 3 0 0 1 0 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ChatbotIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="7" width="16" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7V4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="3" r="1.2" fill="currentColor" />
      <circle cx="8.5" cy="12.5" r="1.3" fill="currentColor" />
      <circle cx="15.5" cy="12.5" r="1.3" fill="currentColor" />
      <path d="M9 16h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CrmIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a0 0 0 0 1 0 0Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M17 8h1a2 2 0 0 1 2 2v6l-3-2h-4a2 2 0 0 1-2-2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function IntegrationIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M9 3v4M15 3v4M9 17v4M15 17v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="6" y="7" width="12" height="10" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.5 12h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function VerifiedBadgeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2.5 14 4l2.7-.4 1 2.6 2.4 1.3-.5 2.7 1.4 2.4-1.9 2 .3 2.7-2.6 1-1.3 2.4-2.7-.6L12 21.5l-1.3 1.5-2.7-.6-1.3-2.4-2.6-1 .3-2.7-1.9-2 1.4-2.4-.5-2.7 2.4-1.3 1-2.6L9 4l2-1.5Z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
      <path d="M8.5 12.3 11 14.8l4.7-5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MailIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4 6.5 8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 3.5 9 4c.5 1 .7 2.2 1.3 3.1.4.6.2 1.3-.3 1.7l-1.3 1c.9 2 2.5 3.6 4.5 4.5l1-1.3c.4-.5 1.1-.7 1.7-.3.9.6 2.1.8 3.1 1.3l.5 2c-1 1.2-2.6 1.8-4.1 1.4-4.6-1.2-8.2-4.8-9.4-9.4-.4-1.5.2-3.1 1.4-4.1Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8 12.5 2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5H6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function StorefrontIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 9 5 4.5h14L20.5 9" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M3.5 9a2.3 2.3 0 0 0 4.5.6A2.3 2.3 0 0 0 12.5 9a2.3 2.3 0 0 0 4.5.6A2.3 2.3 0 0 0 21.5 9" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M4.5 9.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.5 20v-5.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V20" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function CustomerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 20c1.2-4.3 4.2-6.5 7-6.5s5.8 2.2 7 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InboxIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 12h4l1.5 3h5L16 12h4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
      <rect x="4" y="6" width="16" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function TemplateIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 9h8M8 12.5h8M8 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function QrCodeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.3 6.3h.4M17.3 6.3h.4M6.3 17.3h.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14.5 14.5h2.7v2.7M20 14.5v.01M14.5 20v.01M17.8 17.8h2.2M17.8 20.5h2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BuildingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 20V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15M13 20v-8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 7.5h.01M11 7.5h.01M8 11h.01M11 11h.01M8 14.5h.01M11 14.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 20h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function GraduationCapIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6 10.7v4.3c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M21.5 8.5v5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PlaneIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3 13.5 10 11l7.5-7c1-1 2.5-1 3 0 .4.8 0 2-1 3l-7 7.5-2.5 7-2-1 .8-4.8L4.5 17l-1.5-.5.5-1.5L7 12.3 3 13.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function HeartPulseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 20s-7.5-4.6-9.8-9.4C1 7.6 2.6 4.5 5.7 4c2-.3 3.7.7 4.9 2.3.4.5.7 1 1 1.6h.8c.3-.6.6-1.1 1-1.6C14.6 4.7 16.3 3.7 18.3 4c3.1.5 4.7 3.6 3.5 6.6C19.5 15.4 12 20 12 20Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4.5 11h3l1.5-3 2 5 1.5-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShoppingCartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3 4h2l2.4 11.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L20.5 8H6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="20.5" r="1.4" fill="currentColor" />
      <circle cx="17" cy="20.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function CoffeeCupIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 5c0-1 1-1 1-2M12 5c0-1 1-1 1-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TrendUpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3 17 9.5 10.5 13.5 14.5 21 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 6h5.5v5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TargetIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function HeadsetIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="3" y="13" width="4" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="17" y="13" width="4" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M19 19v1a3 3 0 0 1-3 3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * فقاعة رسالة بأسلوب واتساب (خضراء + ذيل فقاعة + علامة استلام مزدوجة بيضاء) — ليست إيموجي عام، بل
 * رسم مباشر لعنصر واجهة واتساب الفعلي (فقاعة + ✓✓) بحيث يظهر بوضوح أنها "أداة واتساب" وليست رمزاً
 * عاماً. تُستخدم في انيميشن الـHero فقط، مقاسها أكبر من بقية الأيقونات (viewBox أوسع لتفاصيل الذيل).
 */
export function WhatsAppMessageIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M6 9a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4H13l-5 4v-4.6A4 4 0 0 1 6 17.6V9Z"
        fill="#25D366"
      />
      <path d="m11.5 14.5 3 3 6-6.5" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
