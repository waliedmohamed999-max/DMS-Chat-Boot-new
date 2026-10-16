/** Published WhatsApp packages on dmstech.sa/offers, reviewed 2026-10-16.
 * These are company service packages; requests go to the company's canonical order pages.
 * Existing tenant subscription records and billing limits are intentionally independent.
 * Temporary offers remain on the canonical site so expired promotions are never cached here.
 */
export const COMPANY_WHATSAPP_PLANS = [
  {
    key: "wa-basic", name: "الانطلاق", monthlySar: 599, annualSar: 5990, popular: false, startingFrom: false,
    summary: "رقم رسمي منظم وفريق يرد من مكان واحد",
    audience: "للأنشطة التي تبدأ مع واتساب الأعمال الرسمي",
    delivery: "3 أيام عمل بعد اعتماد ميتا",
    features: ["ربط رقمك الرسمي وتوثيق النشاط لدى ميتا", "صندوق محادثات لمستخدم واحد", "قائمة ترحيب للخدمات والفروع وأوقات العمل", "رد خارج الدوام و20 رداً سريعاً", "تصنيف المحادثات وملاحظات داخلية", "تقرير شهري للمحادثات وسرعة الرد"],
    exclusions: ["رسوم رسائل ميتا حسب الاستخدام", "الشات بوت والحملات ضمن الباقات الأعلى"],
  },
  {
    key: "wa-pro", name: "الاحترافية", monthlySar: 1299, annualSar: 12990, popular: true, startingFrom: false,
    summary: "بوت يرد ويحجز ويؤهل العملاء ويوزعهم على فريقك",
    audience: "للعيادات والمتاجر والعقار والأنشطة الخدمية",
    delivery: "7 أيام عمل بعد اعتماد ميتا",
    features: ["مستخدمان مع توزيع المحادثات", "شات بوت بمسارات مخصصة لنشاطك", "تأهيل العميل وتحويله للفريق بملخص", "10 قوالب رسائل للتأكيد والتذكير والمتابعة", "إعداد الحملات للعملاء الموافقين على التواصل", "ربط سلة أو زد أو جداول جوجل", "تقارير شهرية لأداء الفريق والحملات"],
    exclusions: ["رسوم رسائل ميتا حسب الاستخدام", "الذكاء الاصطناعي وتكامل CRM ضمن الحلول المتقدمة"],
  },
  {
    key: "wa-advanced", name: "أتمتة الأعمال", monthlySar: 2999, annualSar: 29990, popular: false, startingFrom: true,
    summary: "واتساب مربوط بأنظمتك ومساعد ذكي وأتمتة كاملة",
    audience: "للشركات متعددة الفروع والمتاجر عالية الطلبات",
    delivery: "عادةً 3 إلى 4 أسابيع بعد تحديد النطاق",
    features: ["مزايا الاحترافية مع 3 مستخدمين", "مساعد ذكي بالعربية والإنجليزية من ملفاتك", "تكامل مع CRM أو ERP", "استرداد السلات وإشعارات الطلب والشحن", "توزيع المحادثات تلقائياً حسب الفرع", "مدير حساب ومراجعة شهرية للأداء"],
    exclusions: ["رسوم ميتا والذكاء الاصطناعي حسب الاستخدام", "المستخدمون والتكاملات الإضافية حسب الطلب"],
  },
] as const;
