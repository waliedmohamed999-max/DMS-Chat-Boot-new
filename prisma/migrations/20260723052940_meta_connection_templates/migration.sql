-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TemplateStatus" ADD VALUE 'PAUSED';
ALTER TYPE "TemplateStatus" ADD VALUE 'DISABLED';

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "webhookSubscribed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "buttonsJson" JSONB,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "externalTemplateId" TEXT,
ADD COLUMN     "footerText" TEXT,
ADD COLUMN     "headerText" TEXT,
ADD COLUMN     "headerType" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MessageTemplate_externalTemplateId_idx" ON "MessageTemplate"("externalTemplateId");

