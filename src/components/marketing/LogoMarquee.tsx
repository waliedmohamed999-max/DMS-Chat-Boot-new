// القيمة الافتراضية (placeholder wordmarks) تُستخدم فقط إن لم يمرَّر أي عميل — المصدر الفعلي الآن
// هو SiteContent.clientLogos القابل للتعديل من admin/content (راجع DECISIONS.md).
const PLACEHOLDER_CLIENTS = [
  { name: "متجر الأناقة" }, { name: "بوتيك لمسة" }, { name: "صالون روز" }, { name: "عطور الشرق" },
  { name: "مطعم تراثنا" }, { name: "عيادة الشفاء" }, { name: "كافيه المسافة" }, { name: "متجر التقنية الذكية" },
];

type ClientLogo = { name: string; imageUrl?: string };

function LogoBadge({ client }: { client: ClientLogo }) {
  if (client.imageUrl) {
    return (
      <div className="mx-3 flex h-16 w-44 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={client.imageUrl} alt={client.name} className="max-h-10 max-w-full object-contain" />
      </div>
    );
  }
  return (
    <div className="mx-3 flex h-16 w-44 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-center text-sm font-bold text-slate-500 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-400">
      {client.name}
    </div>
  );
}

export function LogoMarquee({ clients = PLACEHOLDER_CLIENTS }: { clients?: ClientLogo[] }) {
  return (
    <div className="relative overflow-hidden" dir="ltr" aria-hidden="true">
      {/* تدرّج شفافية عند الحواف لإخفاء بداية/نهاية الشريط المتحرك بانسيابية */}
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent dark:from-slate-950" />
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent dark:from-slate-950" />
      <div className="flex w-max animate-marquee">
        {[...clients, ...clients].map((client, i) => (
          <LogoBadge key={`${client.name}-${i}`} client={client} />
        ))}
      </div>
    </div>
  );
}
