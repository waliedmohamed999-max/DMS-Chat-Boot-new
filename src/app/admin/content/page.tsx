import { requireSuperAdminSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { getSiteContent } from "@/lib/siteContent";
import {
  updateHeroContent,
  updateFeaturesContent,
  updateStatsContent,
  updateTestimonialsContent,
  updateClientsContent,
  updateContactBannerContent,
  updateAboutContent,
  updateServicesContent,
} from "./actions";

function featuresToLines(features: { title: string; body: string }[]): string {
  return features.map((f) => `${f.title} | ${f.body}`).join("\n");
}
function statsToLines(stats: { value: string; label: string }[]): string {
  return stats.map((s) => `${s.value} | ${s.label}`).join("\n");
}
function testimonialsToLines(testimonials: { name: string; role: string; quote: string }[]): string {
  return testimonials.map((t) => `${t.name} | ${t.role} | ${t.quote}`).join("\n");
}
function clientsToLines(clients: { name: string; imageUrl?: string }[]): string {
  return clients.map((c) => `${c.name} | ${c.imageUrl ?? ""}`).join("\n");
}
function servicesToLines(services: { title: string; body: string; points: string[] }[]): string {
  return services.map((s) => `${s.title} | ${s.body} | ${s.points.join(";")}`).join("\n");
}

export default async function SiteContentPage() {
  const session = await requireSuperAdminSession();
  if (!hasPermission(session.user.role, "platform.content.manage")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية تعديل محتوى الموقع. هذه الصفحة محصورة بمالك المنصة.
      </div>
    );
  }

  const content = await getSiteContent();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">محتوى الموقع (الصفحة الرئيسية)</h1>
        <p className="text-sm text-slate-400">
          تعديل نصوص وصور الموقع التسويقي مباشرة — يظهر التغيير فوراً بلا حاجة لتعديل كود أو إعادة نشر.
          يشمل الصفحة الرئيسية، وصفحتي "من نحن" و"الخدمات".
        </p>
      </div>

      <form action={updateHeroContent} className="card max-w-3xl space-y-4 p-6">
        <h2 className="font-semibold text-white">القسم الرئيسي (Hero)</h2>
        <div>
          <label className="label-field">العنوان الرئيسي</label>
          <input name="heroHeadline" defaultValue={content.heroHeadline} required className="input-field" />
        </div>
        <div>
          <label className="label-field">النص التوضيحي</label>
          <textarea name="heroSubheadline" defaultValue={content.heroSubheadline} required rows={2} className="input-field text-sm" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label-field">نص الزر الأساسي</label>
            <input name="heroCtaPrimary" defaultValue={content.heroCtaPrimary} required className="input-field" />
          </div>
          <div>
            <label className="label-field">نص الزر الثانوي</label>
            <input name="heroCtaSecondary" defaultValue={content.heroCtaSecondary} required className="input-field" />
          </div>
        </div>
        <button type="submit" className="btn-primary">حفظ القسم الرئيسي</button>
      </form>

      <form action={updateFeaturesContent} className="card max-w-3xl space-y-4 p-6">
        <h2 className="font-semibold text-white">قسم الميزات</h2>
        <div>
          <label className="label-field">عنوان القسم</label>
          <input name="featuresHeading" defaultValue={content.featuresHeading} required className="input-field" />
        </div>
        <div>
          <label className="label-field">الميزات (سطر لكل ميزة، بصيغة: العنوان | الوصف)</label>
          <textarea name="features" defaultValue={featuresToLines(content.features)} required rows={5} className="input-field text-sm" dir="rtl" />
          <p className="mt-1 text-xs text-slate-500">الأيقونات ثابتة بترتيبها الحالي في الكود ولا تتغيّر من هنا.</p>
        </div>
        <button type="submit" className="btn-primary">حفظ الميزات</button>
      </form>

      <form action={updateStatsContent} className="card max-w-3xl space-y-4 p-6">
        <h2 className="font-semibold text-white">شريط الإحصائيات</h2>
        <div>
          <label className="label-field">الإحصائيات (سطر لكل رقم، بصيغة: القيمة | الوصف)</label>
          <textarea name="stats" defaultValue={statsToLines(content.stats)} required rows={4} className="input-field text-sm" dir="rtl" />
        </div>
        <button type="submit" className="btn-primary">حفظ الإحصائيات</button>
      </form>

      <form action={updateTestimonialsContent} className="card max-w-3xl space-y-4 p-6">
        <h2 className="font-semibold text-white">آراء العملاء</h2>
        <div>
          <label className="label-field">عنوان القسم</label>
          <input name="testimonialsHeading" defaultValue={content.testimonialsHeading} required className="input-field" />
        </div>
        <div>
          <label className="label-field">الآراء (سطر لكل رأي، بصيغة: الاسم | الصفة | نص الرأي)</label>
          <textarea name="testimonials" defaultValue={testimonialsToLines(content.testimonials)} required rows={5} className="input-field text-sm" dir="rtl" />
        </div>
        <button type="submit" className="btn-primary">حفظ آراء العملاء</button>
      </form>

      <form action={updateClientsContent} className="card max-w-3xl space-y-4 p-6">
        <h2 className="font-semibold text-white">شريط العملاء المميزون</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label-field">عنوان القسم</label>
            <input name="clientsHeading" defaultValue={content.clientsHeading} required className="input-field" />
          </div>
          <div>
            <label className="label-field">النص التوضيحي</label>
            <input name="clientsSubtext" defaultValue={content.clientsSubtext} required className="input-field" />
          </div>
        </div>
        <div>
          <label className="label-field">
            العملاء (سطر لكل عميل، بصيغة: الاسم | رابط الشعار — رابط الشعار اختياري، يظهر بطاقة نصية إن تُرك فارغاً)
          </label>
          <textarea name="clientLogos" defaultValue={clientsToLines(content.clientLogos)} required rows={9} className="input-field text-sm" dir="rtl" />
        </div>
        <button type="submit" className="btn-primary">حفظ العملاء المميزون</button>
      </form>

      <form action={updateContactBannerContent} className="card max-w-3xl space-y-4 p-6">
        <h2 className="font-semibold text-white">بانر "تواصل معنا"</h2>
        <div>
          <label className="label-field">العنوان</label>
          <input name="contactHeading" defaultValue={content.contactHeading} required className="input-field" />
        </div>
        <div>
          <label className="label-field">النص</label>
          <textarea name="contactBody" defaultValue={content.contactBody} required rows={2} className="input-field text-sm" />
        </div>
        <div>
          <label className="label-field">نص الزر</label>
          <input name="contactCtaLabel" defaultValue={content.contactCtaLabel} required className="input-field" />
        </div>
        <button type="submit" className="btn-primary">حفظ بانر التواصل</button>
      </form>

      <form action={updateAboutContent} className="card max-w-3xl space-y-4 p-6">
        <h2 className="font-semibold text-white">صفحة "من نحن" (/about)</h2>
        <div>
          <label className="label-field">العنوان</label>
          <input name="aboutHeading" defaultValue={content.aboutHeading} required className="input-field" />
        </div>
        <div>
          <label className="label-field">الفقرات (سطر واحد لكل فقرة)</label>
          <textarea name="aboutParagraphs" defaultValue={content.aboutParagraphs.join("\n")} required rows={8} className="input-field text-sm" />
        </div>
        <button type="submit" className="btn-primary">حفظ صفحة "من نحن"</button>
      </form>

      <form action={updateServicesContent} className="card max-w-3xl space-y-4 p-6">
        <h2 className="font-semibold text-white">صفحة "الخدمات" (/services)</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label-field">العنوان</label>
            <input name="servicesHeading" defaultValue={content.servicesHeading} required className="input-field" />
          </div>
          <div>
            <label className="label-field">النص التوضيحي</label>
            <input name="servicesSubheading" defaultValue={content.servicesSubheading} required className="input-field" />
          </div>
        </div>
        <div>
          <label className="label-field">
            الخدمات الخمس (سطر لكل خدمة، بصيغة: العنوان | الوصف | نقطة1;نقطة2;نقطة3) — العدد والترتيب ثابتان (5 أيقونات مقرونة بالترتيب فقط)
          </label>
          <textarea name="servicesItems" defaultValue={servicesToLines(content.servicesItems)} required rows={8} className="input-field text-sm" dir="rtl" />
        </div>
        <button type="submit" className="btn-primary">حفظ صفحة "الخدمات"</button>
      </form>
    </div>
  );
}
