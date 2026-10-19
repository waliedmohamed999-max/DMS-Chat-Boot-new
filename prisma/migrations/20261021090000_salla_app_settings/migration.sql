-- إعدادات تطبيق سلة من لوحة الأدمن بدل متغيرات البيئة فقط
ALTER TABLE "PlatformSettings" ADD COLUMN "sallaAppId" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "sallaClientId" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "encryptedSallaClientSecret" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "encryptedSallaWebhookSecret" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "encryptedSallaFunctionsSecret" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "sallaPlanMapJson" JSONB;
