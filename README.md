# منصة واصل — WhatsApp CRM SaaS متعدد المستأجرين

منصة SaaS لإدارة علاقات العملاء عبر واتساب، تُباع للتجار كاشتراك شهري. كل تاجر يحصل على
مساحة عمل مستقلة بالكامل (عزل بيانات فعلي عبر Postgres Row Level Security)، مع حملات واتساب،
شات بوت، صندوق محادثات موحّد، وربط مع زد وسلة.

راجع [DECISIONS.md](./DECISIONS.md) لكل القرارات المعمارية ومبرراتها، و[QA_REPORT.md](./QA_REPORT.md)
لحالة الجاهزية الحالية والمخاطر المتبقية، و[BRAND_GUIDE.md](./BRAND_GUIDE.md) للهوية البصرية.

## التشغيل محلياً

### المتطلبات
- Node.js 20+
- Docker (لتشغيل Postgres وRedis محلياً)

### خطوات التشغيل

```bash
# 1) تثبيت الحزم
npm install

# 2) تشغيل قاعدة البيانات وRedis
docker compose up -d

# 3) نسخ متغيرات البيئة
cp .env.example .env
# عدّل ENCRYPTION_KEY وNEXTAUTH_SECRET بقيم حقيقية عبر: openssl rand -base64 32

# 4) تطبيق المخطط + تفعيل عزل المستأجرين (RLS) + الأدوار المحدودة الصلاحية
npm run db:migrate
docker exec -i wa_crm_postgres psql -U wa_crm -d wa_crm < prisma/postgres-rls.sql
# إنشاء أدوار قاعدة البيانات المحدودة (app_runtime بدون RLS bypass، app_superadmin بـ BYPASSRLS)
# — نُفّذت يدوياً أثناء البناء الأول، انظر قسم "أدوار قاعدة البيانات" أدناه لإعادة إنشائها في بيئة جديدة.

# 5) زرع بيانات تجريبية (مستأجرين تجريبيين + مستخدمين + حملات + إلخ)
npm run db:seed

# 6) تشغيل التطبيق
npm run dev
# في نافذة طرفية أخرى، شغّل عامل إرسال الحملات:
npm run worker
```

افتح `http://localhost:3000/login`. حسابات تجريبية (كلمة المرور للجميع: `Demo@12345`):

| الدور | البريد الإلكتروني |
|---|---|
| مالك المنصة (Super Admin — كل الصلاحيات) | `admin@platform.sa` |
| فريق الدعم الفني الداخلي (موافقات + انتحال هوية) | `support@platform.sa` |
| الفريق المالي الداخلي (إيرادات فقط) | `billing@platform.sa` |
| صاحب متجر الأناقة للعطور (tenant-a، باقة النمو) | `owner@tenant-a.sa` |
| مدير متجر الأناقة للعطور | `admin@tenant-a.sa` |
| موظف متجر الأناقة للعطور | `agent@tenant-a.sa` |
| صاحب بوتيك لمسة (tenant-b، باقة الأساسية) | `owner@tenant-b.sa` |
| صاحب متجر بانتظار المراجعة (لاختبار مركز الموافقات) | `owner@tenant-pending.sa` |

### أدوار قاعدة البيانات (مهم جداً لعزل المستأجرين)

المنصة تعتمد على 3 أدوار Postgres منفصلة — **هذا هو أساس عزل البيانات فعلياً**، وليس مجرد اتفاقية كود:

```sql
-- يُنفَّذ مرة واحدة عند تزويد بيئة جديدة (بعد أول migrate)
CREATE ROLE app_runtime LOGIN PASSWORD '...' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE wa_crm TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

CREATE ROLE app_superadmin LOGIN PASSWORD '...' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
-- نفس الـ GRANTs أعلاه لكن لـ app_superadmin
```

- `DATABASE_URL` (يستخدمه التطبيق بالكامل) → يتصل بـ `app_runtime`. **بدون** BYPASSRLS، فتخضع
  كل استعلاماته فعلياً لسياسات RLS بغض النظر عن أي خطأ برمجي في where clause.
- `DIRECT_URL` (يستخدمه `prisma migrate` فقط) → يتصل بدور superuser (لإنشاء/تعديل الجداول).
- `SUPER_ADMIN_DATABASE_URL` (يستخدمه `lib/db.ts → superAdminDb` حصراً) → يتصل بـ `app_superadmin`
  (BYPASSRLS بدون superuser) لاستعلامات لوحة Super Admin المجمّعة عبر كل المستأجرين، ولتسجيل الدخول
  (البحث بالبريد قبل معرفة tenantId).

**لماذا ليس superuser؟** Postgres يتجاهل RLS تلقائياً لأي دور superuser بغض النظر عن `FORCE ROW LEVEL
SECURITY` — هذا اكتُشف فعلياً أثناء بناء هذه المنصة (الدور الافتراضي لصورة postgres الرسمية هو
superuser) وتم إصلاحه بإنشاء الأدوار المحدودة أعلاه. راجع `prisma/verify-isolation.ts` للاختبار الفعلي.

## اختبار عزل المستأجرين

```bash
npm run db:verify-isolation
```

ينفّذ 4 اختبارات فعلية ضد Postgres حقيقي: قراءة عادية، قراءة بمعرف مباشر لمستأجر آخر، ومحاولة
إدخال صف بـ `tenantId` مزوّر — كلها يجب أن تُرفض من قاعدة البيانات نفسها (RLS)، وليس فقط من كود التطبيق.

## اختبار دخان شامل (Smoke Test)

```bash
npm run build && npm run start   # في نافذة
npm run worker                    # في نافذة أخرى
npm run smoke-test                # يقود Chromium فعلي عبر كل الوحدات ويحفظ لقطات شاشة في .smoke-shots/
node scripts/smoke-register.js    # يختبر تسجيل تاجر جديد من الصفر
node scripts/smoke-chatbot.js     # يختبر بوابات الباقة والأدوار في وحدة الشات بوت تحديداً
node scripts/smoke-super-admin.js # يختبر مركز الموافقات، التعليق، تأثير حدود الباقة، الانتحال، وRBAC الداخلي
node scripts/smoke-admin-v2.js    # يختبر إدارة الباقات الكاملة، تبويبات بيانات التاجر، موافقة القوالب، ووضع الصيانة
```

## كيف يفعّل التاجر تكامل واتساب/زد/سلة فعلياً من لوحته

كل الأزرار التالية موجودة في **لوحة التاجر → التكاملات** (`/dashboard/integrations`):

1. **واتساب (Meta Cloud API)**: زر "ربط الآن". في `INTEGRATIONS_MODE=sandbox` (الافتراضي) يُنشئ
   اتصالاً وهمياً فورياً برقم تجريبي لعرض التجربة الكاملة. في الإنتاج (`INTEGRATIONS_MODE=live`)
   يحتاج `META_APP_ID`/`META_APP_SECRET` حقيقيين من Meta for Developers، وينفّذ Embedded Signup
   الفعلي (`lib/integrations/meta/adapter.ts`).
2. **زد**: زر "ربط الآن" ثم "إعادة مزامنة" لسحب الطلبات والعملاء. في الإنتاج يحتاج
   `ZID_CLIENT_ID`/`ZID_CLIENT_SECRET` من Zid Partners Portal.
3. **سلة**: نفس الآلية، يحتاج `SALLA_CLIENT_ID`/`SALLA_CLIENT_SECRET` من Salla Partners.

نقاط استقبال الـ Webhooks جاهزة على:
- `POST /api/webhooks/meta` (+ `GET` للتحقق `hub.challenge`)
- `POST /api/webhooks/zid`
- `POST /api/webhooks/salla`

كل واحد يتحقق من التوقيع (HMAC) قبل المعالجة، ويُسجَّل في سجل الأحداث الظاهر على نفس صفحة التكاملات.

## الوحدات

| الوحدة | المسار |
|---|---|
| Onboarding | `/register` |
| نظرة عامة | `/dashboard` |
| صندوق المحادثات | `/dashboard/inbox` |
| جهات الاتصال (CRM) | `/dashboard/contacts` |
| الحملات | `/dashboard/campaigns` |
| الشات بوت (قوالب جاهزة + بوابات باقة/دور) | `/dashboard/chatbot` |
| اختبار شات بوت للقراءة فقط (دور الموظف) | `/dashboard/chatbot/[id]/test` |
| التكاملات | `/dashboard/integrations` |
| الفوترة والاشتراك | `/dashboard/billing` |
| الفريق والإعدادات | `/dashboard/settings` |
| Super Admin — نظرة عامة | `/admin` |
| Super Admin — مركز الموافقات | `/admin/approvals` |
| Super Admin — التجار المشتركون (تفاصيل عميقة لكل تاجر) | `/admin/tenants` |
| Super Admin — صحة المنصة | `/admin/health` |
| Super Admin — الإيرادات والفوترة | `/admin/billing` |
| Super Admin — حدود الباقات (الشات بوت) | `/admin/plans` |
| Super Admin — إعلانات المنصة | `/admin/announcements` |
| Super Admin — فريق المنصة الداخلي | `/admin/team` |
| Super Admin — سجل التدقيق الشامل | `/admin/audit-log` |
| Super Admin — إعدادات المنصة العامة (Sandbox/Live، وضع الصيانة) | `/admin/settings` |
| Super Admin — تفاصيل تاجر (تبويبات: فريق/جهات اتصال/حملات/شات بوت/قوالب/طلبات) | `/admin/tenants/[id]` |
| قوالب الرسائل (تقديم للمراجعة) | `/dashboard/templates` |
