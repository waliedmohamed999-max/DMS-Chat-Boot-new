// بيانات وهمية واقعية لوضع Sandbox — تُستخدم عندما لا تتوفر مفاتيح API حقيقية.
// كل تكامل يستدعي منها ليعطي تجربة واجهة كاملة دون أي استدعاء شبكي فعلي.

export const SANDBOX_META_ACCOUNT = {
  phoneNumberId: "sandbox-phone-778812345",
  displayPhoneNumber: "+966 55 000 1234",
  verifiedName: "المتجر التجريبي",
  qualityRating: "GREEN",
  messagingTier: "TIER_1K (حتى 1000 محادثة/24 ساعة)",
};

export const SANDBOX_ZID_ORDERS = [
  { id: "zid-9001", customerName: "عميل تجريبي 1", total: 250, status: "PAID" },
  { id: "zid-9002", customerName: "عميل تجريبي 2", total: 480, status: "ABANDONED_CART" },
];

export const SANDBOX_SALLA_ORDERS = [
  { id: "salla-4501", customerName: "عميل تجريبي 3", total: 120, status: "SHIPPED" },
];

export function sandboxAccountIdFor(provider: string): string {
  return `sandbox-${provider.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
}

// نصوص رسائل واردة واقعية لمحاكي صندوق المحادثات (Sandbox) — تُستخدم بدل نص ثابت واحد متكرر.
export const SANDBOX_INBOUND_TEXTS = [
  "السلام عليكم، عندي استفسار عن طلبي الأخير",
  "هل يتوفر هذا المنتج بمقاس أكبر؟",
  "متى يصل الطلب رقم 1042؟",
  "شكراً جزيلاً على المتابعة السريعة 🙏",
  "أريد إلغاء طلبي من فضلكم",
];

export const SANDBOX_INBOUND_LOCATION = { latitude: 24.7136, longitude: 46.6753, name: "الرياض، المملكة العربية السعودية" };
export const SANDBOX_INBOUND_DOCUMENT = { filename: "فاتورة-إرجاع.pdf", mimeType: "application/pdf" };
export const SANDBOX_INBOUND_IMAGE_CAPTION = "هذه صورة المنتج اللي وصلني، فيه خلل بسيط";

// صورة SVG مضمَّنة (data URI) بدل رابط خارجي حقيقي — لا يوجد تخزين وسائط فعلي في هذه البيئة
// (انظر قرار "عدم بناء تخزين وسائط حقيقي" في DECISIONS.md)، وربط رابط خارجي حقيقي (placeholder
// service مثلاً) يفشل بصمت في بيئات بلا اتصال إنترنت خارجي ويُظهر خطأ شبكة غير حقيقي في السجلات.
// أسباب رفض قوالب واقعية (تطابق أنماط رفض Meta الفعلية المعروفة) لمحاكي اعتماد القوالب
export const SANDBOX_TEMPLATE_REJECTION_REASONS = [
  "المحتوى يخالف سياسة واتساب التجارية (WhatsApp Business Policy) لهذه الفئة",
  "النص يحتوي على عبارات ترويجية غير مسموحة لقالب من فئة خدمي (Utility)",
  "التنسيق أو المتغيرات غير مطابقة لإرشادات Meta لصياغة القوالب",
  "اسم القالب أو محتواه يشبه قالباً مرفوضاً سابقاً لنفس الحساب",
];

export const SANDBOX_INBOUND_IMAGE_DATA_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#334155"/><text x="50%" y="50%" font-size="20" fill="#e2e8f0" text-anchor="middle" dominant-baseline="middle">صورة المنتج (تجريبي)</text></svg>`
  );
