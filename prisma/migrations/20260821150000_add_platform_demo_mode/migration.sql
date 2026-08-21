-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "platformDemoModeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlatformChatSession" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;
