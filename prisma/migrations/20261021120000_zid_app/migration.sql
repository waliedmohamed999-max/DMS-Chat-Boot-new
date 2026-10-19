-- تطبيق زد من لوحة الأدمن + مصدر انضمام تجار زد
ALTER TYPE "TenantJoinSource" ADD VALUE IF NOT EXISTS 'ZID_APP';
ALTER TABLE "PlatformSettings" ADD COLUMN "zidAppId" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "zidClientId" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "encryptedZidClientSecret" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "encryptedZidMarketSecret" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "zidPlanMapJson" JSONB;
