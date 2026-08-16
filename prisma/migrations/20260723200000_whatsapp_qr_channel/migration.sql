-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'WHATSAPP_QR';

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "encryptedSessionData" TEXT,
ADD COLUMN     "qrTrialExpiresAt" TIMESTAMP(3);

