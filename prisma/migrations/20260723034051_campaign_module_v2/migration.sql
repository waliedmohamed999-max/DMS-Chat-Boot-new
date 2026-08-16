-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('ONE_TIME', 'TRIGGERED');

-- CreateEnum
CREATE TYPE "AudienceType" AS ENUM ('ALL', 'SEGMENT');

-- CreateEnum
CREATE TYPE "TriggerEvent" AS ENUM ('ABANDONED_CART', 'CUSTOMER_INACTIVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'ACTIVE';
ALTER TYPE "CampaignStatus" ADD VALUE 'PAUSED';

-- AlterEnum
ALTER TYPE "RecipientStatus" ADD VALUE 'READ';

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_segmentId_fkey";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "audienceType" "AudienceType" NOT NULL DEFAULT 'SEGMENT',
ADD COLUMN     "readCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "triggerConfigJson" JSONB,
ADD COLUMN     "triggerEvent" "TriggerEvent",
ADD COLUMN     "type" "CampaignType" NOT NULL DEFAULT 'ONE_TIME',
ALTER COLUMN "segmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CampaignRecipient" ADD COLUMN     "conversionRevenueSar" INTEGER,
ADD COLUMN     "convertedOrderId" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "readAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "marketingOptIn" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "campaignLimitsJson" JSONB;

-- CreateIndex
CREATE INDEX "Campaign_tenantId_type_idx" ON "Campaign"("tenantId", "type");

-- CreateIndex
CREATE INDEX "CampaignRecipient_convertedOrderId_idx" ON "CampaignRecipient"("convertedOrderId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

