-- يُنفَّذ مرة واحدة فقط عند تزويد بيئة قاعدة بيانات جديدة (Render/Neon/Supabase/إلخ)، بعد تطبيق
-- migrations (prisma migrate deploy) وقبل تشغيل التطبيق. يُنفَّذ بدور المالك الافتراضي لقاعدة
-- البيانات (الدور اللي بيديهولك Render وقت الإنشاء — نفس دور DIRECT_URL).
--
-- استبدل CHANGE_ME_APP_RUNTIME_PASSWORD وCHANGE_ME_APP_SUPERADMIN_PASSWORD بكلمتي مرور عشوائيتين قويتين
-- (openssl rand -base64 24) قبل التنفيذ، واحتفظ بهما لضبط DATABASE_URL/SUPER_ADMIN_DATABASE_URL.

CREATE ROLE app_runtime LOGIN PASSWORD 'CHANGE_ME_APP_RUNTIME_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE wa_crm_db_g5ka TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- بلا BYPASSRLS عمداً (راجع الشرح الكامل في postgres-rls.sql) — منصات الاستضافة المُدارة (Render
-- وغيرها) لا تسمح لدور غير Superuser بمنح BYPASSRLS لأي دور آخر إطلاقاً؛ التجاوز الفعلي لهذا الدور
-- يتم عبر شرط `current_user = 'app_superadmin'` صريح داخل كل Policy، لا عبر خاصية على الدور نفسه.
CREATE ROLE app_superadmin LOGIN PASSWORD 'CHANGE_ME_APP_SUPERADMIN_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE wa_crm_db_g5ka TO app_superadmin;
GRANT USAGE ON SCHEMA public TO app_superadmin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_superadmin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_superadmin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_superadmin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_superadmin;

-- الخطوة الأخيرة (منفصلة عمداً — راجع الملف نفسه): طبّق prisma/postgres-rls.sql بنفس الاتصال.
