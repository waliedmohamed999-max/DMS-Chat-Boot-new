-- Row Level Security لعزل بيانات المستأجرين على مستوى قاعدة البيانات نفسها.
-- يُنفَّذ بعد كل `prisma migrate` جديد يضيف جدولاً مستأجراً جديداً.
-- المبدأ: كل جدول فيه tenantId يُفعَّل عليه RLS، وPolicy تسمح فقط بالصفوف التي
-- tenantId = current_setting('app.current_tenant_id', true)::text
-- التطبيق يضبط هذا المتغير عبر `SET LOCAL app.current_tenant_id = '<id>'` داخل كل transaction (lib/db.ts -> withTenant()).
-- ملاحظة: SUPER_ADMIN لا يمرّ عبر withTenant إطلاقاً، بل عبر اتصال منفصل بصلاحية BYPASSRLS (دور db منفصل super_admin_role)
-- محصور على استعلامات القراءة المجمّعة فقط في لوحة Super Admin.

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
        USING ("tenantId" = current_setting('app.current_tenant_id', true))
        WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));$f$,
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
    EXISTS (
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
    EXISTS (
      SELECT 1 FROM "Contact" c
      WHERE c.id = "ContactTag"."contactId"
        AND c."tenantId" = current_setting('app.current_tenant_id', true)
    )
  );

-- دور قاعدة بيانات منفصل لـ Super Admin يتجاوز RLS، يُستخدم فقط في استعلامات لوحة Super Admin المجمّعة للقراءة.
-- (التنفيذ الفعلي لإنشاء الدور يتم يدوياً عبر psql عند التزويد الأول للبيئة الإنتاجية، لأنه يتطلب صلاحية superuser
--  لا تُمنح تلقائياً عبر migration scripts لأسباب أمنية.)
-- CREATE ROLE super_admin_role BYPASSRLS LOGIN PASSWORD '...';
