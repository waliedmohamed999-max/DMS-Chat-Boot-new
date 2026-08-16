import { LogoFull } from "@/components/Logo";

const DEFAULT_BULLETS = [
  { icon: "✅", text: "ربط رسمي مع WhatsApp Business Platform" },
  { icon: "🤖", text: "شات بوت ذكي بلا كود" },
  { icon: "📊", text: "تقارير وتحليلات لحظية لكل حملة" },
  { icon: "🔒", text: "بيانات كل تاجر معزولة وآمنة بالكامل" },
];

/**
 * غلاف موحَّد لكل صفحات "الدخول/الانضمام" (تسجيل الدخول، إنشاء حساب ذاتي، ونظام الشركاء بكل
 * مراحله) — هوية بصرية واحدة بدل ثلاث صفحات مستقلة الشكل. لوحة ترويجية يسارية بألوان الهوية
 * (الشعار + شرح مختصر + نقاط قوة، بأسلوب صفحات دخول منتجات SaaS الاحترافية) ونموذج فعلي يمينها.
 * تُخفى اللوحة الترويجية على الشاشات الصغيرة (الجوال) ليبقى النموذج نفسه هو الأولوية هناك.
 */
export function AuthShell({
  children,
  bullets = DEFAULT_BULLETS,
  tagline = "منصة واحدة لإدارة كل محادثات عملائك على واتساب",
}: {
  children: React.ReactNode;
  bullets?: { icon: string; text: string }[];
  tagline?: string;
}) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-wa-700/40 p-12 lg:flex">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-wa-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-wa-500/10 blur-3xl" />

        <LogoFull size="md" light />

        <div className="relative z-10">
          <h2 className="text-2xl font-bold leading-snug text-white">{tagline}</h2>
          <ul className="mt-6 space-y-3">
            {bullets.map((b) => (
              <li key={b.text} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-sm">{b.icon}</span>
                {b.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex items-center gap-6 border-t border-white/10 pt-6 text-white/70">
          <div>
            <p className="text-lg font-bold text-white">+250</p>
            <p className="text-xs">تاجر نشط</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">2.4M+</p>
            <p className="text-xs">رسالة شهرياً</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">97%</p>
            <p className="text-xs">رضا العملاء</p>
          </div>
        </div>
      </div>

      {/* لوحة النموذج تبقى بنفس الخلفية الداكنة المستخدمة أصلاً في كل نماذج الدخول/التسجيل
          (bg-navy-900 ومكوّناتها .card/.input-field/.btn-primary الحالية) عمداً — توحيد الهوية هنا
          يتحقق عبر اللوحة الترويجية المشتركة والشعار الموحَّد، لا بإعادة كتابة كل نموذج من الصفر. */}
      <div className="flex w-full flex-1 items-center justify-center overflow-y-auto bg-navy-900 px-4 py-12 lg:w-1/2">
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}
