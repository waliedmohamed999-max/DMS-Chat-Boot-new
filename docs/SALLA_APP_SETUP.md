# إعداد تطبيق DMS Tech في بوابة شركاء سلة

دليل إعداد التطبيق في [بوابة شركاء سلة](https://salla.partners) ليعمل مع كود المنصة. استبدل
`https://YOUR-DOMAIN` بالنطاق الفعلي للمنصة في كل الروابط.

## 1. بيانات التطبيق

| الإعداد | القيمة |
|---|---|
| النوع | عام (Public) — تصنيف **تطبيقات التواصل** — الميزة المدعومة: WhatsApp |
| نمط المصادقة | **النمط السهل** |
| الصلاحيات (قراءة فقط) | البيانات الأساسية، العملاء، الطلبات، السلات، المنتجات |
| الصلاحيات (قراءة وتعديل) | ويب هوك |

## 2. التنبيهات (Webhooks)

| الإعداد | القيمة |
|---|---|
| رابط استقبال التنبيهات | `https://YOUR-DOMAIN/api/webhooks/salla` |
| خطة الحماية | Signature (الكود يدعم Token أيضاً) |
| أحداث التطبيق | `app.store.authorize`، `app.installed`، `app.updated`، `app.uninstalled`، `app.settings.updated` |
| أحداث المتجر | `order.created`، `order.updated`، `order.status.updated`، `order.cancelled`، `order.refunded`، `abandoned.cart`، `customer.created`، `customer.updated`، `product.created`، `product.updated`، `product.deleted`، `product.quantity.low` |

## 3. المفاتيح — من لوحة الأدمن

افتح **لوحة الأدمن ← تطبيق سلة** (`/admin/salla`) والصق القيم أدناه ثم "حفظ" — تسري فوراً بلا إعادة نشر،
والأسرار تُخزَّن مشفَّرة. فعّل "ولّد سراً جديداً" لسر الدوال وانسخه (يُعرض مرة واحدة) إلى كود الدالتين في القسم 4.
في نفس الصفحة: ربط باقات سلة بباقات DMS، روابط اللصق جاهزة للنسخ، والمتاجر المربوطة مع زر مزامنة.

متغيرات البيئة أدناه ما زالت مدعومة كاحتياط لأي حقل لم يُضبط من اللوحة:


| المتغير | المصدر |
|---|---|
| `SALLA_CLIENT_ID` | مفاتيح التطبيقات ← الرقم التعريفي للعميل |
| `SALLA_CLIENT_SECRET` | مفاتيح التطبيقات ← المفتاح السري للعميل |
| `SALLA_WEBHOOK_SECRET` | التنبيهات ← مفتاح التنبيهات السري |
| `SALLA_APP_ID` | رقم التطبيق (أعلى صفحة التطبيق) |
| `SALLA_FUNCTIONS_SECRET` | سلسلة عشوائية تولّدها أنت (`openssl rand -hex 32`) وتضعها أيضاً في كود الدوال أدناه |

## 4. خطوات تثبيت التطبيق (App Onboarding)

خطوتان، كل منهما بدالة (Edit Function). الدالتان ترسلان بيانات النموذج لخادم المنصة
(`/api/salla/onboarding`) موقَّعة بـ`SALLA_FUNCTIONS_SECRET`، وتعرضان أخطاء التحقق تحت الحقول.

### الخطوة 1: حسابك في DMS (Slug: `dms_account`، غير إلزامية)

| معرّف الحقل | النوع | العنوان |
|---|---|---|
| `dms_email` | بريد إلكتروني (اختياري) | لديك حساب DMS ببريد مختلف عن بريد متجرك؟ اكتبه هنا — وإلا اتركه فارغاً |

> لو كتب التاجر بريداً، **لا يُربط المتجر بذلك الحساب إلا بعد تأكيد صاحب البريد** من رابط يصله على بريده.
> لو تركه فارغاً: يُربط تلقائياً بالحساب الذي له نفس بريد المتجر، أو يُنشأ حساب جديد.

### الخطوة 2: واتساب والرسائل التلقائية (Slug: `dms_preferences`)

| معرّف الحقل | النوع | العنوان |
|---|---|---|
| `whatsapp_number` | نص (اختياري) | رقم واتساب متجرك (مثال: +9665XXXXXXXX) |
| `abandoned_cart` | مربع اختيار | فعّل رسائل استرداد السلات المتروكة |
| `welcome` | مربع اختيار | فعّل رسالة ترحيب للعملاء الجدد |

### كود الدالة (نفس الكود للخطوتين — غيّر قيمة `STEP` فقط)

```ts
const STEP = "account"; // في الخطوة 2: "preferences"
const ENDPOINT = "https://YOUR-DOMAIN/api/salla/onboarding";
const SECRET = "ضع هنا قيمة SALLA_FUNCTIONS_SECRET";

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async (context: Onboarding): Promise<Resp> => {
  const ctx = context as any;
  const fields = ctx.payload?.data?.fields ?? {};
  const merchantId = ctx.merchant?.id ?? ctx.merchant ?? ctx.payload?.merchant ?? ctx.payload?.data?.merchant;
  const body = JSON.stringify({ merchant_id: merchantId, step: STEP, fields });

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-DMS-Signature": await hmacHex(SECRET, body) },
    body,
  });

  if (res.status === 422) {
    const err = await res.json();
    return Resp.error().setMessage(err.message).setStatus(422).setFields(err.message, err.fields);
  }
  if (!res.ok) {
    return Resp.error().setMessage("تعذّر الاتصال بـ DMS Tech، حاول مرة أخرى").setStatus(res.status);
  }
  return Resp.success().setMessage("تم الحفظ");
};
```

> تحقّق في أداة **Preview** داخل محرر الدالة من اسم الحقل الذي يحمل رقم التاجر في `context` — الكود أعلاه
> يجرب الأشكال المحتملة. لو وصل `merchant_id` فارغاً سيرد الخادم بخطأ 400.

## 5. إعدادات التطبيق (حدث `app.settings.updated`)

أضف في نموذج إعدادات التطبيق حقلين من نوع تبديل (Switch) بهذين المفتاحين بالضبط:

| المفتاح | العنوان |
|---|---|
| `abandoned_cart_enabled` | رسائل استرداد السلات المتروكة |
| `welcome_enabled` | رسالة الترحيب بالعملاء الجدد |

تغييرهما من سلة يشغّل/يوقف الحملة الآلية المقابلة في DMS. لو لم تُنشأ الحملة بعد (تحتاج قالب واتساب
معتمد)، تُحفظ الرغبة وتظهر للتاجر "طلبت تفعيلها — اختر القالب".

## 6. الصفحات المضمنة (Embedded Pages)

| الإعداد | القيمة |
|---|---|
| Route slug | `dashboard` |
| Iframe URL | `https://YOUR-DOMAIN/salla/app` |
| الصفحة الافتراضية | مفعّل |

الصفحة تتحقق من رمز سلة عبر Introspection API (تحتاج `SALLA_APP_ID`)، ومسموح تضمينها من نطاقات سلة فقط.

## 7. التجربة

1. ثبّت التطبيق على متجر تجريبي من قسم "تجربة التطبيق".
2. أكمل خطوتي الإعداد، ثم افتح التطبيق من لوحة المتجر التجريبي ("استخدام التطبيق").
3. في DMS: صفحة **التكاملات ← إدارة ربط سلة** تعرض المتجر والأحداث الواصلة.

## 8. قناة التواصل (تطبيق تواصل — رسائل المتجر عبر واتساب DMS)

بعد اختيار التاجر لـ DMS كمزوّد واتساب لمتجره (التطبيقات ← الإعدادات ← تخصيص)، تمرّر سلة رسائل المتجر
(حالة الطلب، الفاتورة، السلة المتروكة، رمز التحقق…) لدالة التطبيق، فترسلها لخادم DMS الذي يرسلها من رقم
واتساب التاجر المربوط في DMS.

- في **Supported Features**: فعّل **Whatsapp**.
- في **App Functions**: أضف دالة بالحدث `communication.whatsapp.send` بهذا الكود:

```ts
const ENDPOINT = "https://YOUR-DOMAIN/api/salla/communication";
const SECRET = "ضع هنا قيمة SALLA_FUNCTIONS_SECRET";

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async (context: CommunicationEvent): Promise<Resp> => {
  const ctx = context as any;
  const body = JSON.stringify(ctx.payload);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-DMS-Signature": await hmacHex(SECRET, body) },
    body,
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) return Resp.error().setMessage(result.message ?? "تعذّر الإرسال عبر DMS Tech");
  return Resp.success().setMessage(`أُرسلت ${result.sent ?? 0} رسالة عبر DMS Tech`);
};
```

السلوك في DMS:
- رموز التحقق (OTP) تُرسل ولا تُحفظ نصوصها في أي مكان.
- الرسائل التسويقية لا تُرسل لعميل ألغى موافقته التسويقية.
- كل رسالة تُحتسب من حصة باقة DMS الشهرية. لا إرسال لحساب غير مفعّل أو اشتراك منتهٍ.
- الرسائل تظهر في صندوق محادثات التاجر كرسائل نظام، والأحداث في صفحة ربط سلة.

## 9. الاشتراكات عبر سلة (أحداث `app.subscription.*` و`app.trial.*`)

أضف أحداث التطبيق: `app.trial.started`، `app.trial.expired`، `app.trial.canceled`،
`app.subscription.started`، `app.subscription.renewed`، `app.subscription.canceled`، `app.subscription.expired`.

مطابقة باقة سلة بباقة DMS (بالترتيب):
1. متغير البيئة `SALLA_PLAN_MAP` (JSON): `{"اسم الباقة في سلة": "مفتاح باقة DMS"}` — مثال:
   `{"الأساسية": "starter", "النمو": "growth", "التوسع": "scale"}`
2. مفتاح الباقة في DMS = `item_slug` أو اسم الباقة في سلة.
3. اسم الباقة في سلة = اسمها العربي في DMS حرفياً.

باقة غير مطابقة لا تغيّر شيئاً وتظهر كتنبيه في سجل أحداث سلة. التاجر الذي يُحصَّل اشتراكه عبر سلة لا يستطيع
تغيير الباقة أو إلغاءها من صفحة الفوترة في DMS (تظهر له رسالة توجيه لسلة).

## 10. عامل الخلفية على استضافة بعملية واحدة (Hostinger)

الرسائل التلقائية والحملات ومهام الجدولة تحتاج عامل الخلفية. على استضافة لا تسمح إلا بعملية واحدة اضبط
`RUN_WORKER_IN_PROCESS=1` فيعمل العامل داخل خادم Next.js نفسه. على خادم يشغّل `npm run worker` منفصلاً لا تضبطه.
