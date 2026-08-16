import { Reveal } from "@/components/marketing/Reveal";
import {
  CampaignIcon, CrmIcon, InboxIcon, ChatbotIcon, TemplateIcon,
  IntegrationIcon, QrCodeIcon, StorefrontIcon, ClockIcon,
} from "@/components/marketing/ServiceIcons";

// كل عنصر هنا يطابق قدرة حقيقية موجودة فعلياً في المنصة (لا وعود بميزات غير مُنفَّذة) — راجع
// src/lib/integrations/{meta,whatsappQr,zid,salla} وnav لوحة التاجر (dashboard/layout.tsx). القنوات
// الأربع الأولى فعلية تماماً؛ العنصر الخامس مُعلَّم "قريباً" صراحةً (وليس قناة فعلية) — أُضيف فقط
// لموازنة عدد بطاقات القنوات مع الأدوات بصرياً، بلا ادّعاء وجود قناة خامسة تعمل الآن.
const CHANNELS = [
  { icon: IntegrationIcon, title: "واتساب API", body: "ربط رسمي مع WhatsApp Business Platform تحت علامتك التجارية." },
  { icon: QrCodeIcon, title: "تعايش واتساب بزنس", body: "اربط رقمك عبر مسح رمز QR، بلا حاجة لمراجعة أو إعلانات Meta." },
  { icon: StorefrontIcon, title: "زد (Zid)", body: "مزامنة تلقائية لطلبات ومنتجات متجرك على منصة زد." },
  { icon: StorefrontIcon, title: "سلة (Salla)", body: "مزامنة تلقائية لطلبات ومنتجات متجرك على منصة سلة." },
  { icon: ClockIcon, title: "قنوات جديدة قريباً", body: "نعمل على إضافة قنوات وتكاملات جديدة — ترقّب التحديثات.", comingSoon: true },
];

const TOOLS = [
  { icon: CampaignIcon, title: "الحملات", body: "أرسل حملات جماعية وأتمتة استرداد السلة المتروكة." },
  { icon: CrmIcon, title: "جهات الاتصال", body: "نظام CRM بسيط مبني حول محادثات عملائك الفعلية." },
  { icon: InboxIcon, title: "صندوق الوارد", body: "صندوق محادثات موحّد لكل فريقك على قناة واحدة." },
  { icon: ChatbotIcon, title: "الموظف الذكي", body: "مساعد ذكاء اصطناعي يردّ بالعربية والإنجليزية." },
  { icon: TemplateIcon, title: "قوالب الرسائل", body: "قوالب معتمدة من Meta جاهزة لحملاتك ومحادثاتك." },
];

function GridItem({
  icon: Icon, title, body, comingSoon,
}: {
  icon: (p: { className?: string }) => React.ReactNode; title: string; body: string; comingSoon?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 transition ${
        comingSoon
          ? "border-dashed border-slate-200 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02]"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-card dark:border-white/10 dark:bg-slate-900"
      }`}
    >
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
          comingSoon ? "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500" : "bg-wa-50 text-wa-600 dark:bg-wa-500/10 dark:text-wa-400"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          {title}
          {comingSoon && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">قريباً</span>}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{body}</p>
      </div>
    </div>
  );
}

export function ChannelsToolsSection() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">القنوات والأدوات في مكان واحد</h2>
          <p className="mt-3 text-slate-500 dark:text-slate-400">اربط قنواتك الحقيقية، وأدر كل تفاعل مع عملائك من نفس لوحة التحكم.</p>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Reveal>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-wa-600 dark:text-wa-400">القنوات</h3>
            <div className="grid grid-cols-1 gap-3">
              {CHANNELS.map((c) => <GridItem key={c.title} {...c} />)}
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-wa-600 dark:text-wa-400">الأدوات</h3>
            <div className="grid grid-cols-1 gap-3">
              {TOOLS.map((t) => <GridItem key={t.title} {...t} />)}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
