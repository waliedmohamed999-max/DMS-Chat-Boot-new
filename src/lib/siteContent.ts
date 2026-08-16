import { rawDb } from "@/lib/db";

const SINGLETON_ID = "singleton";

export type FeatureItem = { title: string; body: string };
export type StatItem = { value: string; label: string };
export type TestimonialItem = { name: string; role: string; quote: string };
export type ClientLogoItem = { name: string; imageUrl?: string };
export type ServiceItem = { title: string; body: string; points: string[] };

export type SiteContentData = {
  heroHeadline: string;
  heroSubheadline: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;
  featuresHeading: string;
  features: FeatureItem[];
  stats: StatItem[];
  testimonialsHeading: string;
  testimonials: TestimonialItem[];
  clientsHeading: string;
  clientsSubtext: string;
  clientLogos: ClientLogoItem[];
  contactHeading: string;
  contactBody: string;
  contactCtaLabel: string;
  aboutHeading: string;
  aboutParagraphs: string[];
  servicesHeading: string;
  servicesSubheading: string;
  servicesItems: ServiceItem[];
};

/**
 * القيم الافتراضية مطابقة حرفياً للنصوص التي كانت مكتوبة مباشرة في page.tsx قبل بناء هذه اللوحة —
 * حتى لا يتغيّر شكل الصفحة الرئيسية إطلاقاً قبل أول تعديل فعلي من مالك المنصة عبر admin/content.
 */
const DEFAULTS: Omit<SiteContentData, "features" | "stats" | "testimonials" | "clientLogos" | "servicesItems"> & {
  features: FeatureItem[];
  stats: StatItem[];
  testimonials: TestimonialItem[];
  clientLogos: ClientLogoItem[];
  servicesItems: ServiceItem[];
} = {
  heroHeadline: "أدر محادثات عملائك على واتساب من مكان واحد",
  heroSubheadline:
    "حملات، شات بوت ذكي، وCRM موحّد — مبني على WhatsApp Business Platform الرسمي، لكل متجر وعيادة وصالون ونشاط خدمي.",
  heroCtaPrimary: "ابدأ الآن كشريك",
  heroCtaSecondary: "شاهد كيف تعمل المنصة",
  featuresHeading: "كل شيء تحتاجه في مكان واحد",
  features: [
    { title: "حملات وشرائح ذكية", body: "استهدف عملاءك بحملات فورية أو آلية مثل استرداد السلة المتروكة تلقائياً." },
    { title: "شات بوت ذكي بلا كود", body: "ابنِ تدفقات ردّ آلي واختبرها قبل النشر، مع تحويل سلس للموظف البشري عند الحاجة." },
    { title: "CRM موحّد", body: "صندوق محادثات واحد لكل فريقك، مع ملف كامل لكل عميل وسجل تفاعلاته." },
    { title: "تكامل مع متجرك", body: "ربط حقيقي مع Zid وسلة لمزامنة الطلبات، أو ربط رقم واتساب Cloud API يدوياً." },
  ],
  stats: [
    { value: "+250", label: "تاجر نشط" },
    { value: "+2.4M", label: "رسالة مُرسلة شهرياً" },
    { value: "97%", label: "رضا العملاء" },
  ],
  testimonialsHeading: "ماذا يقول عملاؤنا",
  testimonials: [
    { name: "سارة العتيبي", role: "صاحبة متجر عطور", quote: "خلال أسبوع واحد قلّت رسائل العملاء الضائعة تقريباً للصفر، والشات بوت بيرد على الأسئلة المتكررة بدل فريقي." },
    { name: "محمد الدوسري", role: "مدير مطعم", quote: "ربط المنصة برقم الواتساب الرسمي كان أسهل مما توقعت، وحملات استرداد الطلبات المتروكة رجّعت لنا مبيعات فعلية." },
    { name: "نورة القحطاني", role: "صاحبة صالون تجميل", quote: "لوحة تحكم واحدة لكل فريقي بدل كل واحدة تستخدم واتسابها الشخصي — فرق كبير في التنظيم." },
  ],
  clientsHeading: "عملاء مميزون",
  clientsSubtext: "ينضم إلينا يومياً أصحاب متاجر وعيادات وصالونات من كل الأحجام",
  clientLogos: [
    { name: "متجر الأناقة" }, { name: "بوتيك لمسة" }, { name: "صالون روز" }, { name: "عطور الشرق" },
    { name: "مطعم تراثنا" }, { name: "عيادة الشفاء" }, { name: "كافيه المسافة" }, { name: "متجر التقنية الذكية" },
  ],
  contactHeading: "لديك سؤال؟ فريقنا جاهز يرد عليك",
  contactBody: "راسلنا وسيرد عليك فريق الدعم خلال ساعتين في أيام العمل — عبر النموذج أو واتساب أو البريد الإلكتروني.",
  contactCtaLabel: "تواصل معنا الآن",
  aboutHeading: "من نحن",
  aboutParagraphs: [
    "بدأت فكرة \"DMS\" (Digital Messaging System) من ملاحظة بسيطة تتكرر عند كل صاحب متجر وعيادة وصالون تقريباً: عملاؤك يراسلونك على واتساب، لكن رسائلهم موزّعة بين هاتف شخصي، وأحياناً أكثر من موظف، بلا أي سجل موحّد أو طريقة لمعرفة من ردّ على ماذا. النتيجة رسائل تُفقد، عملاء يُنتظَرون بلا رد، وفرص بيع حقيقية تضيع بصمت.",
    "في المقابل، أغلب أدوات إدارة علاقات العملاء (CRM) العالمية إما لا تتحدث العربية بشكل طبيعي، أو لا تدعم واتساب كقناة تواصل أساسية أصلاً، أو معقدة أكثر مما يحتاجه صاحب نشاط صغير أو متوسط يريد فقط أن يرد على عملائه بسرعة ومنظّم.",
    "بنينا DMS لتكون الحل العربي المباشر لهذه المشكلة: منصة واحدة تجمع محادثاتك، تؤتمت ردودك المتكررة عبر شات بوت ذكي، وتربط متجرك الإلكتروني مباشرة بواتسابك — كل ذلك عبر ربط رسمي مع WhatsApp Business Platform، وليس أدوات غير رسمية تعرّض رقمك للحظر.",
    "فريقنا يجمع بين خبرة تقنية عميقة في بناء منصات SaaS، وفهم عملي لاحتياجات التجار العرب اليومية — لأننا بنينا هذه المنصة معتمدين على محادثات حقيقية مع أصحاب أنشطة تعاملوا مع نفس المشكلة كل يوم.",
  ],
  servicesHeading: "خدماتنا",
  servicesSubheading: "كل ما تحتاجه لإدارة تواصلك مع عملائك عبر واتساب، في منصة واحدة.",
  servicesItems: [
    { title: "الحملات الإعلانية عبر واتساب", body: "أرسل حملات مجزّأة حسب شرائح عملائك (جدد، عملاء متكررون، سلة متروكة) باستخدام قوالب رسائل معتمدة من Meta. تتبّع نتائج كل حملة لحظياً: عدد المُرسَل، المُسلَّم، المقروء، والمبيعات الفعلية الناتجة عنها.", points: ["استهداف بالشرائح والفلاتر", "قوالب رسائل معتمدة رسمياً", "تتبع تحويل المبيعات لكل حملة", "حملات آلية (استرداد السلة المتروكة، تنشيط العملاء الخاملين)"] },
    { title: "الشات بوت الذكي", body: "محرر تدفقات بصري بلا كود: صمّم رحلة الرد الآلي بالسحب والإفلات، اختبرها قبل النشر، وحوّل المحادثة لموظف بشري في أي لحظة تحتاج تدخلاً إنسانياً.", points: ["محرر تدفقات بصري بلا كود", "اختبار حي قبل النشر", "تحويل سلس للموظف البشري", "ردود سريعة محفوظة للأسئلة المتكررة"] },
    { title: "CRM موحّد", body: "صندوق محادثات واحد يجمع كل رسائل عملائك عبر واتساب، مع ملف عميل كامل (بيانات، مرحلة الشراء، سجل الطلبات) وأدوات فريق (تعيين المحادثات، ملاحظات داخلية، أدوار وصلاحيات).", points: ["صندوق محادثات موحّد للفريق كامل", "ملف عميل كامل وسجل تفاعلات", "تعيين المحادثات وملاحظات داخلية", "أدوار وصلاحيات دقيقة لكل عضو"] },
    { title: "تكامل المتاجر", body: "ربط حقيقي مع منصتي زد وسلة يزامن طلباتك ومنتجاتك تلقائياً، ويتيح حملات استرداد السلة المتروكة بلا أي تدخل يدوي.", points: ["مزامنة تلقائية للطلبات والمنتجات", "استرداد السلة المتروكة آلياً", "ربط رقم واتساب Cloud API يدوياً أيضاً"] },
    { title: "الربط الرسمي مع واتساب (Meta)", body: "المنصة مبنية على WhatsApp Business Platform الرسمي من Meta — ليست أداة غير رسمية تعرّض رقمك لخطر الحظر. هذا يعني موثوقية أعلى، إمكانية استخدام قوالب رسائل معتمدة، ودعماً لفريق أكبر على نفس الرقم.", points: ["بناء على WhatsApp Business Platform الرسمي", "لا خطر حظر الرقم كما في الأدوات غير الرسمية", "قوالب رسائل معتمدة من Meta", "دعم فريق متعدد على نفس رقم واتساب"] },
  ],
};

/** يجلب محتوى الصفحة الرئيسية، وينشئ الصف الافتراضي (مطابق للنصوص الأصلية) تلقائياً إن لم يوجد بعد. */
export async function getSiteContent(): Promise<SiteContentData> {
  const row = await rawDb.siteContent.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID, ...DEFAULTS },
  });

  return {
    heroHeadline: row.heroHeadline,
    heroSubheadline: row.heroSubheadline,
    heroCtaPrimary: row.heroCtaPrimary,
    heroCtaSecondary: row.heroCtaSecondary,
    featuresHeading: row.featuresHeading,
    features: row.features as FeatureItem[],
    stats: row.stats as StatItem[],
    testimonialsHeading: row.testimonialsHeading,
    testimonials: row.testimonials as TestimonialItem[],
    clientsHeading: row.clientsHeading,
    clientsSubtext: row.clientsSubtext,
    clientLogos: row.clientLogos as ClientLogoItem[],
    contactHeading: row.contactHeading,
    contactBody: row.contactBody,
    contactCtaLabel: row.contactCtaLabel,
    aboutHeading: row.aboutHeading,
    aboutParagraphs: row.aboutParagraphs as string[],
    servicesHeading: row.servicesHeading,
    servicesSubheading: row.servicesSubheading,
    servicesItems: row.servicesItems as ServiceItem[],
  };
}
