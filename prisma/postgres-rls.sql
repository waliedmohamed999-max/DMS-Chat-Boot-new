-- Row Level Security لعزل بيانات المستأجرين على مستوى قاعدة البيانات نفسها.
-- يُنفَّذ بعد كل `prisma migrate` جديد يضيف جدولاً مستأجراً جديداً.
-- المبدأ: كل جدول فيه tenantId يُفعَّل عليه RLS، وPolicy تسمح فقط بالصفوف التي
-- tenantId = current_setting('app.current_tenant_id', true)::text
-- التطبيق يضبط هذا المتغير عبر `SET LOCAL app.current_tenant_id = '<id>'` داخل كل transaction (lib/db.ts -> withTenant()).
-- ملاحظة: SUPER_ADMIN لا يمرّ عبر withTenant إطلاقاً، بل عبر اتصال منفصل بدور db منفصل app_superadmin.
--
-- تجاوز RLS لدور app_superadmin عبر شرط `current_user = 'app_superadmin'` صريح داخل كل Policy (وليس
-- خاصية BYPASSRLS على الدور نفسه) — قرار مُتعمَّد اكتُشف ضرورته فعلياً عند النشر الأول على منصة
-- استضافة مُدارة (Render): الدور الافتراضي المُقدَّم من هذه المنصات ليس Superuser حقيقياً، فلا يقدر
-- يمنح BYPASSRLS لأي دور آخر إطلاقاً ("Only roles with the BYPASSRLS attribute may create roles with
-- the BYPASSRLS attribute") — قيد منصة، وليس خطأ إعداد. الشرط الصريح هنا يعطي نفس الأثر (تجاوز كامل
-- لعزل tenantId لهذا الدور تحديداً) بلا الاعتماد على أي صلاحية نظام خاصة، فيعمل بنفس السلوك على أي
-- بيئة (محلية أو مُدارة) بلا استثناء.

-- تفعيل RLS + policy لكل جدول مستأجر
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'User', 'Contact', 'Tag', 'Conversation', 'Message',
    'MessageTemplate', 'Segment', 'Campaign',
    'ChatbotFlow', 'Integration', 'WebhookLog', 'Product', 'Order',
    'AuditLog', 'Subscription', 'Invoice',
    'ApprovalRequest', 'MerchantNote', 'ImpersonationSession', 'AnnouncementDismissal',
    'QuickReply', 'InternalNote', 'ContactImportBatch', 'PaymentMethod', 'CreditNote',
    'AiAgentConfig', 'AiReplyLog'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', t
    );
    -- بعض الجداول (User, WebhookLog, AuditLog) لديها tenantId اختياري (NULL لـ SUPER_ADMIN / global logs)
    -- لذلك نسمح بالصف إن كان tenantId = الجلسة الحالية، أو NULL فقط عند عدم ضبط الجلسة (سياق super admin منفصل).
    EXECUTE format(
      $f$CREATE POLICY tenant_isolation_policy ON %I
        USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_user = 'app_superadmin')
        WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_user = 'app_superadmin');$f$,
      t
    );
  END LOOP;
END $$;

-- الجداول التي لا تحمل tenantId مباشرة (جداول ربط/تابعة) تُعزل عبر join policy لجدول الأب:
ALTER TABLE "CampaignRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CampaignRecipient" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "CampaignRecipient";
CREATE POLICY tenant_isolation_policy ON "CampaignRecipient"
  USING (
    current_user = 'app_superadmin'
    OR EXISTS (
      SELECT 1 FROM "Campaign" c
      WHERE c.id = "CampaignRecipient"."campaignId"
        AND c."tenantId" = current_setting('app.current_tenant_id', true)
    )
  );

ALTER TABLE "ContactTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactTag" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "ContactTag";
CREATE POLICY tenant_isolation_policy ON "ContactTag"
  USING (
    current_user = 'app_superadmin'
    OR EXISTS (
      SELECT 1 FROM "Contact" c
      WHERE c.id = "ContactTag"."contactId"
        AND c."tenantId" = current_setting('app.current_tenant_id', true)
    )
  );

-- دور قاعدة بيانات منفصل لـ Super Admin يتجاوز RLS لاستعلامات لوحة Super Admin المجمّعة للقراءة —
-- عبر شرط current_user في كل Policy أعلاه (وليس BYPASSRLS، راجع الشرح أعلى الملف). يُنشأ الدور نفسه
-- عبر prisma/bootstrap-roles.sql عند تزويد أي بيئة جديدة (محلية أو مُدارة).
