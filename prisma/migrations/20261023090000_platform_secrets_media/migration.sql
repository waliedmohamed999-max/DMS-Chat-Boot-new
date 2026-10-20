-- مفاتيح الحسابات من لوحة الأدمن + معرّف وسائط الرسائل الواردة
ALTER TABLE "PlatformSettings" ADD COLUMN "encryptedIntegrationSecrets" TEXT;
ALTER TABLE "Message" ADD COLUMN "providerMediaId" TEXT;
