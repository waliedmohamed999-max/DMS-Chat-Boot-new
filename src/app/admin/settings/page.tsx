import { requireSuperAdminSession } from "@/lib/session";
import { hasEffectivePermission } from "@/lib/rbac";
import { getPlatformSettings } from "@/lib/platformSettings";
import { updatePlatformSettings } from "./actions";

export default async function GlobalSettingsPage() {
  const session = await requireSuperAdminSession();
  if (!hasEffectivePermission(session.user.permissions, "platform.settings.manage")) {
    return (
      <div className="card p-8 text-center text-slate-400">
        ليس لديك صلاحية تعديل إعدادات المنصة العامة. هذه الصفحة محصورة بمالك المنصة.
      </div>
    );
  }

  const settings = await getPlatformSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">إعدادات المنصة العامة</h1>
        <p className="text-sm text-slate-400">إعدادات تؤثر على كل التجار فوراً — بلا تعديل كود أو إعادة نشر.</p>
      </div>

      <form action={updatePlatformSettings} className="card max-w-2xl space-y-5 p-6">
        <div>
          <label className="label-field">وضع التكاملات (Meta/زد/سلة)</label>
          <select name="integrationsMode" defaultValue={settings.integrationsMode} className="input-field">
            <option value="sandbox">🧪 تجريبي (Sandbox) — بيانات وهمية لكل التجار</option>
            <option value="live">🔴 مباشر (Live) — يتطلب مفاتيح API حقيقية في متغيرات البيئة</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            يتحكم فعلياً في سلوك كل adapter تكامل لكل تاجر فوراً — وليس مجرد قيمة عرض.
          </p>
        </div>

        <div className="rounded-lg border border-warning-500/20 bg-warning-500/5 p-4">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-warning-500">
            <input type="checkbox" name="maintenanceMode" defaultChecked={settings.maintenanceMode} />
            وضع الصيانة (يمنع كل التجار من الوصول للوحاتهم فوراً)
          </label>
          <textarea
            name="maintenanceMessage"
            defaultValue={settings.maintenanceMessage ?? ""}
            rows={2}
            className="input-field text-sm"
            placeholder="رسالة تظهر للتجار أثناء الصيانة (مثال: نجري صيانة مجدولة، سنعود خلال ساعة)"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label-field">بريد الدعم الفني</label>
            <input name="supportEmail" defaultValue={settings.supportEmail} required type="email" className="input-field" dir="ltr" />
          </div>
          <div>
            <label className="label-field">هاتف الدعم الفني (اختياري)</label>
            <input name="supportPhone" defaultValue={settings.supportPhone ?? ""} className="input-field" dir="ltr" placeholder="+966500000000" />
          </div>
          <div>
            <label className="label-field">مدة التجربة المجانية الافتراضية (أيام)</label>
            <input name="defaultTrialDays" type="number" min={1} defaultValue={settings.defaultTrialDays} required className="input-field" dir="ltr" />
          </div>
          <div>
            <label className="label-field">نسخة الشروط والأحكام</label>
            <input name="termsVersion" defaultValue={settings.termsVersion ?? ""} className="input-field" dir="ltr" placeholder="v1.0 - 2026-07-23" />
          </div>
        </div>

        <div className="border-t border-white/5 pt-5">
          <h2 className="mb-3 text-sm font-semibold text-white">الفوترة والعملة</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label-field">نسبة ضريبة القيمة المضافة %</label>
              <input
                name="vatPercent" type="number" min={0} max={100} step={0.01}
                defaultValue={settings.vatRateBps / 100} required className="input-field" dir="ltr"
              />
              <p className="mt-1 text-xs text-slate-500">المصدر المركزي الوحيد المستخدَم في كل حسابات الضريبة بوحدة الفوترة.</p>
            </div>
            <div>
              <label className="label-field">العملة الافتراضية</label>
              <input name="defaultCurrency" defaultValue={settings.defaultCurrency} required className="input-field" dir="ltr" maxLength={3} />
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-5">
          <h2 className="mb-3 text-sm font-semibold text-white">بيانات البائع على الفواتير (متطلبات ZATCA)</h2>
          <p className="mb-3 text-xs text-slate-500">تظهر هذه البيانات على كل فاتورة صادرة عن المنصة، بما فيها رمز QR (المرحلة الأولى من هيئة الزكاة والضريبة والجمارك).</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label-field">الاسم القانوني للبائع</label>
              <input name="sellerLegalName" defaultValue={settings.sellerLegalName} required className="input-field" />
            </div>
            <div>
              <label className="label-field">الرقم الضريبي (VAT Number)</label>
              <input name="sellerVatNumber" defaultValue={settings.sellerVatNumber ?? ""} className="input-field" dir="ltr" placeholder="3xxxxxxxxxxxxx03" />
            </div>
            <div className="sm:col-span-2">
              <label className="label-field">العنوان</label>
              <input name="sellerAddress" defaultValue={settings.sellerAddress ?? ""} className="input-field" />
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-5">
          <h2 className="mb-3 text-sm font-semibold text-white">الموظف الذكي (مزوّد الذكاء الاصطناعي)</h2>
          <p className="mb-3 text-xs text-slate-500">مفتاح واحد على مستوى المنصة تستخدمه عقدة "رد ذكي" لكل التجار. بلا مفتاح، تُحوَّل هذه العقدة تلقائياً لموظف بشري بدل رد وهمي.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label-field">النموذج (Model)</label>
              <input name="aiModel" defaultValue={settings.aiModel} required className="input-field" dir="ltr" />
            </div>
            <div>
              <label className="label-field">OpenAI API Key</label>
              <input
                name="openAiApiKey" type="password" className="input-field" dir="ltr"
                placeholder={settings.openAiApiKey ? "•••••••• (محفوظ — اترك فارغاً للإبقاء عليه)" : "غير مُعَدّ بعد"}
              />
              <p className="mt-1 text-xs text-slate-500">لا يُعرَض المفتاح المحفوظ أبداً هنا لأسباب أمنية — أدخل قيمة جديدة فقط لتحديثه.</p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-5">
          <h2 className="mb-3 text-sm font-semibold text-white">شات الموقع التسويقي العام (بلا تسجيل دخول)</h2>
          <p className="mb-3 text-xs text-slate-500">فقاعة شات تظهر لكل زوار الموقع التسويقي، تستخدم نفس مفتاح OpenAI/النموذج أعلاه.</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" name="platformChatEnabled" defaultChecked={settings.platformChatEnabled} />
              تفعيل فقاعة الشات في الموقع التسويقي
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" name="platformChatVoiceReplyEnabled" defaultChecked={settings.platformChatVoiceReplyEnabled} />
              توليد رد صوتي (TTS) إضافي لكل رد نصي — تكلفة إضافية فعلية لكل رسالة
            </label>
          </div>
        </div>

        <div className="border-t border-white/5 pt-5">
          <h2 className="mb-3 text-sm font-semibold text-white">تطبيق Meta على مستوى المنصة (Embedded Signup)</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label-field">Meta App ID</label>
              <input name="metaAppId" defaultValue={settings.metaAppId ?? ""} className="input-field" dir="ltr" placeholder="غير مُعَدّ بعد" />
            </div>
            <div>
              <label className="label-field">Meta App Secret</label>
              <input
                name="metaAppSecret" type="password" className="input-field" dir="ltr"
                placeholder={settings.metaAppSecret ? "•••••••• (محفوظ — اترك فارغاً للإبقاء عليه)" : "غير مُعَدّ بعد"}
              />
              <p className="mt-1 text-xs text-slate-500">لا يُعرَض السر المحفوظ أبداً هنا لأسباب أمنية — أدخل قيمة جديدة فقط لتحديثه.</p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-5">
          <h2 className="mb-3 text-sm font-semibold text-white">مزوّدو الإشعارات</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label-field">مزوّد البريد الإلكتروني</label>
              <select name="emailProviderName" defaultValue={settings.emailProviderName} className="input-field">
                <option value="console">console (طباعة في سجل الخادم فقط — لا مزوّد حقيقي بعد)</option>
              </select>
            </div>
            <div>
              <label className="label-field">مزوّد الرسائل النصية (SMS)</label>
              <select name="smsProviderName" defaultValue={settings.smsProviderName} className="input-field">
                <option value="none">لا يوجد (غير مفعَّل)</option>
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            حقول تحضيرية — لا مزوّد بريد/SMS حقيقي مربوط فعلياً بعد بهذه المنصة. تظهر هنا لتكون جاهزة
            فور اختيار مزوّد حقيقي دون الحاجة لصفحة إعدادات جديدة.
          </p>
        </div>

        <button type="submit" className="btn-primary w-full">حفظ الإعدادات</button>
      </form>
    </div>
  );
}
