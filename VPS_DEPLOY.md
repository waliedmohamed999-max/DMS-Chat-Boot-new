# دليل نشر واصل على VPS حقيقي (خطوة بخطوة، للمبتدئ)

يفترض هذا الدليل استضافة ذاتية على VPS واحد (Hetzner CPX22 أو مشابه) بكل الخدمات (Postgres، Redis،
التطبيق، الـworker، Caddy) عبر Docker Compose في هذا المجلد. **موجود بديل أبسط تشغيلياً (Render.com
يستضيف كل حاجة منفصلة بدون Docker يدوي، بتكلفة أعلى شهرياً) — ناقشه مع Claude قبل ما تبدأ لو حابب
تقارن الاتنين.** الملفات دي: `Dockerfile`، `docker-compose.prod.yml`، `Caddyfile`،
`.env.production.example`، `.dockerignore`.

---

## 0) قبل ما تبدأ

- [ ] عندك دومين حقيقي (اشتريته من أي مسجّل — Namecheap/GoDaddy/أو مسجّل سعودي).
- [ ] عملت سجل DNS من نوع **A** يشاور اسم الدومين (وwww لو حابب) على IP السيرفر اللي هتشتريه في
      الخطوة الجاية — بدون هذا Caddy مش هيقدر يصدر شهادة SSL تلقائياً.
- [ ] الكود موجود في مستودع Git خاص (GitHub/GitLab) — لو لسه مش كده، اعمل ده الأول.

## 1) شراء VPS

اشترِ VPS بمواصفات لا تقل عن 4GB RAM (مثال: Hetzner CPX22 — راجع السعر الفعلي وقت الشراء، تحدثنا
عنه في خطة الـ30 يوم ~35-45 ريال/شهر). اختر نظام تشغيل **Ubuntu 22.04 LTS** أو أحدث.

## 2) تجهيز السيرفر لأول مرة

اتصل بالسيرفر عبر SSH (بيانات الدخول بتوصلك بالإيميل من مزوّد الـVPS)، ثم:

```bash
# تحديث النظام
apt update && apt upgrade -y

# تثبيت Docker Engine + Compose plugin (سكربت التثبيت الرسمي)
curl -fsSL https://get.docker.com | sh

# التأكد إن Docker شغال
docker --version
docker compose version
```

## 3) نقل الكود للسيرفر

**لا تنسخ مجلد XAMPP نفسه بأي شكل** — ده كان مصدر خطر بنيوي مُكتشَف سابقاً في المشروع (راجع
`SECURITY_FIXES.md`). بدل كده، Clone نظيف من المستودع:

```bash
mkdir -p /opt/wasel && cd /opt/wasel
git clone <رابط-المستودع-الخاص-بتاعك> .
```

## 4) ملفات البيئة (خطوتان منفصلتان — لا تخلط بينهما)

**أ) ملف `.env` (بلا لاحقة، في نفس المجلد)** — بيقرأه `docker compose` تلقائياً لقيمتين بس:

```bash
cat > .env << 'EOF'
POSTGRES_PASSWORD=<كلمة مرور عشوائية قوية — openssl rand -base64 24>
DOMAIN=your-real-domain.com
EOF
```

**ب) ملف `.env.production`** — انسخه من القالب واملأه:

```bash
cp .env.production.example .env.production
nano .env.production   # أو أي محرر تفضّله
```

في الخطوة دي، ولّد الأسرار الحقيقية بـ:

```bash
openssl rand -base64 32   # لـ ENCRYPTION_KEY وNEXTAUTH_SECRET (قيمة مختلفة لكل واحد)
openssl rand -base64 24   # لكلمتي مرور app_runtime وapp_superadmin
```

اترك `INTEGRATIONS_MODE="sandbox"` و`PAYMENT_PROVIDER="mock"` مؤقتاً لحد ما يكتمل اعتماد Meta
وربط Moyasar (بندان منفصلان في خطة الـ30 يوم) — مفيش داعي تستنى الاتنين دول عشان تنشر وتختبر
الاستضافة نفسها الأول.

## 5) أول تشغيل — قاعدة البيانات والأدوار أولاً

```bash
# شغّل Postgres وRedis بس الأول
docker compose -f docker-compose.prod.yml up -d postgres redis

# انتظر لحد ما تبقى الحالة healthy
docker compose -f docker-compose.prod.yml ps
```

طبّق المخطط والأدوار (مرة واحدة فقط):

```bash
# 1) تطبيق المخطط (migrations) — يحتاج DIRECT_URL من .env.production محمّلة في البيئة
export $(grep -v '^#' .env.production | xargs)
docker compose -f docker-compose.prod.yml run --rm app npx prisma migrate deploy

# 2) إنشاء أدوار قاعدة البيانات المحدودة الصلاحية — عدّل الملف الأول:
#    غيّر "wa_crm_db_g5ka" إلى "wa_crm" (اسم القاعدة الفعلي في docker-compose.prod.yml)،
#    وضع نفس كلمتي المرور اللي ولّدتها في الخطوة السابقة بدل CHANGE_ME_*.
nano prisma/bootstrap-roles.sql
docker compose -f docker-compose.prod.yml exec -T postgres psql -U wa_crm -d wa_crm < prisma/bootstrap-roles.sql

# 3) تفعيل RLS
docker compose -f docker-compose.prod.yml exec -T postgres psql -U wa_crm -d wa_crm < prisma/postgres-rls.sql
```

تأكد إن `.env.production` فيه بالظبط نفس كلمتي المرور اللي استخدمتهم في `bootstrap-roles.sql`
(الحقول `app_runtime`/`app_superadmin` في `DATABASE_URL`/`SUPER_ADMIN_DATABASE_URL`).

## 6) تشغيل كل شيء

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

هيبني الصورة (أول مرة بتاخد دقايق — بناء Next.js + تثبيت Chromium)، ثم يشغّل التطبيق والـworker
وCaddy. Caddy هيطلب شهادة SSL تلقائياً من Let's Encrypt فور ما يتأكد إن الدومين بيوصله فعلاً.

## 7) التحقق الفعلي (لا تعتبرها نجحت غير بعد ما تشوف الأربعة دول)

- [ ] `https://دومينك` يفتح فعلاً بشهادة SSL صحيحة (قفل أخضر في المتصفح).
- [ ] `docker compose -f docker-compose.prod.yml logs -f worker` — يظهر اتصال BullMQ/Redis ناجح
      بلا أخطاء متكررة.
- [ ] سجّل دخول كمالك منصة (Super Admin) وجرّب توليد فاتورة PDF تجريبية — لو ظهرت بنص عربي سليم،
      يبقى Chromium داخل الحاوية شغال صح.
- [ ] `docker compose -f docker-compose.prod.yml logs app` — بلا استثناءات غير متوقَّعة عند فتح
      الصفحة الرئيسية.

## 8) ربط Webhook واتساب من Meta

في App Dashboard على Meta for Developers، سجّل:
- Callback URL: `https://دومينك/api/webhooks/meta`
- Verify Token: نفس قيمة `META_WEBHOOK_VERIFY_TOKEN` في `.env.production`

## 9) النسخ الاحتياطي (لا تأجّلها)

السكربت `scripts/backup-db.sh` جاهز أصلاً في المشروع لكنه مكتوب لأسماء حاويات بيئة التطوير المحلية —
**راجعه معايا في جلسة تانية قبل ما تعتمد عليه** (لازم يشاور على `wasel_postgres` بدل الاسم القديم،
ويُشحن الناتج لتخزين خارجي مش نفس السيرفر — لو السيرفر اتحرق النسخة المحلية بتروح معاه). جدوله عبر
`crontab -e` يومياً بمجرد ما يتظبط.

## 10) أي تحديث لاحق للكود

```bash
cd /opt/wasel
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

`--build` بيعيد بناء الصورة بس لو فيه تغيير فعلي في الكود — Docker بيستخدم الكاش تلقائياً لباقي
الطبقات فمش بياخد وقت البناء الأول نفسه في المرات الجاية.
