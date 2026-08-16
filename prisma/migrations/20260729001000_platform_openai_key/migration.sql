-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "aiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
ADD COLUMN     "encryptedOpenAiApiKey" TEXT;

