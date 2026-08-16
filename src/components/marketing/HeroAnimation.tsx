import { StorefrontIcon, CustomerIcon, WhatsAppMessageIcon } from "@/components/marketing/ServiceIcons";

/**
 * انيميشن Hero يوضّح فكرة الخدمة بصرياً: رسائل واتساب حقيقية الشكل تتحرك بين متجر وعميل.
 *
 * قرار هندسي: البرومنت طلب انيميشن Lottie، لكن تأليف ملف Lottie (JSON بصيغة Bodymovin) حقيقي وجيد
 * المظهر يدوياً بلا أداة تصميم (After Effects) أو أصل جاهز من مصدر خارجي موثوق غير متاح هنا — وأي
 * ملف JSON مكتوب يدوياً بلا أداة تصدير حقيقية سيكون هشاً وعرضة للكسر. البديل المنفَّذ هنا: نفس الفكرة
 * البصرية عبر CSS/SVG خالص — أخف وزناً وأسرع تحميلاً، ولا يعتمد على أي ملف/مكتبة خارجية.
 *
 * ملاحظة مهمة (إصلاح حقيقي): النسخة الأولى استخدمت إيموجي عامة (🏬💬🛒✅🙂) — تبيَّن فعلياً من
 * لقطة شاشة حقيقية أنها تُعرَض مكسورة/بديلة (tofu) أو بغلاف مختلف تماماً على أنظمة تشغيل معيّنة (لا
 * ضمان لتوفر نفس رموز الإيموجي أو نفس رسمها بين المتصفحات). استُبدلت بالكامل بأيقونات SVG مرسومة —
 * فقاعة الرسالة تحديداً مرسومة بأسلوب واتساب الفعلي (فقاعة خضراء + ذيل + علامة استلام مزدوجة بيضاء
 * ✓✓) بدل رمز عام، ليكون واضحاً أنها "أداة واتساب" حقيقية وليست إيموجي عشوائياً.
 *
 * عنصر بصري بحت (aria-hidden) — لا يحمل أي معنى نصي يحتاج قارئ شاشة.
 */
export function HeroAnimation() {
  return (
    <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
      <div
        dir="ltr"
        className="relative flex h-80 items-center justify-between overflow-hidden rounded-3xl border border-wa-500/20 bg-gradient-to-br from-wa-50 to-white p-8 shadow-card dark:border-wa-500/10 dark:from-slate-800 dark:to-slate-900"
      >
        {/* المتجر */}
        <div className="relative z-10 flex flex-col items-center gap-2">
          <div className="relative flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-2xl bg-white shadow-card dark:bg-slate-700">
            <StorefrontIcon className="h-11 w-11 text-wa-600 dark:text-wa-400" />
            <span className="absolute inset-0 rounded-2xl border-2 border-wa-500/40 animate-wa-pulse-ring" />
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">المتجر</span>
        </div>

        {/* فقاعات رسائل واتساب المتحركة */}
        <div className="absolute inset-x-28 top-0 h-full">
          <div className="absolute top-1/2 left-0 animate-wa-flow" style={{ ["--wa-flow-distance" as string]: "190px", animationDelay: "0s" }}>
            <WhatsAppMessageIcon className="h-10 w-10 drop-shadow" />
          </div>
          <div className="absolute top-1/2 left-0 animate-wa-flow" style={{ ["--wa-flow-distance" as string]: "190px", animationDelay: "1.1s" }}>
            <WhatsAppMessageIcon className="h-10 w-10 drop-shadow" />
          </div>
          <div className="absolute top-1/2 left-0 animate-wa-flow" style={{ ["--wa-flow-distance" as string]: "190px", animationDelay: "2.2s" }}>
            <WhatsAppMessageIcon className="h-10 w-10 drop-shadow" />
          </div>
        </div>

        {/* العميل */}
        <div className="relative z-10 flex flex-col items-center gap-2">
          <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-2xl bg-wa-500 shadow-card">
            <CustomerIcon className="h-11 w-11 text-white" />
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">العميل</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="h-2 w-2 rounded-full bg-wa-500" />
        اتصال مباشر عبر WhatsApp Business Platform
      </div>
    </div>
  );
}
