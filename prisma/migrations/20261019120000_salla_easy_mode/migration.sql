-- ربط سلة بالنمط السهل (Easy Mode): مصدر انضمام جديد، حدث تشغيل ترحيب بالعملاء الجدد، ومنع تكرار معالجة الأحداث.
ALTER TYPE "TenantJoinSource" ADD VALUE IF NOT EXISTS 'SALLA_APP';
ALTER TYPE "TriggerEvent" ADD VALUE IF NOT EXISTS 'NEW_CUSTOMER';

ALTER TABLE "WebhookLog" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "WebhookLog_dedupeKey_key" ON "WebhookLog"("dedupeKey");
