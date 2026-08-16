import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { FloatingWhatsAppButton } from "@/components/marketing/FloatingWhatsAppButton";
import { getPlatformSettings } from "@/lib/platformSettings";

// يقرأ إعدادات حقيقية من القاعدة (رقم الدعم لزر واتساب العائم) لكل صفحة تحت هذا التخطيط — بدون
// هذا السطر يحاول Next.js توليد الصفحات الفرعية (about/privacy/services/terms/vision) بشكل ثابت
// وقت `next build` نفسه، فيفشل البناء بالكامل لو قاعدة البيانات غير متاحة وقت البناء (نفس سبب فشل
// نشر Vercel قبل إعداد قاعدة بيانات سحابية حقيقية). الصفحة الرئيسية للصفحة التسويقية معلَّمة أصلاً
// بنفس التصريح لسببها الخاص (باقات حية) — موجود هنا الآن كمصدر واحد يغطي كل الصفحات دفعة واحدة.
export const dynamic = "force-dynamic";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPlatformSettings();

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Navbar />
      <main>{children}</main>
      <Footer />
      <FloatingWhatsAppButton phone={settings.supportPhone} />
    </div>
  );
}
