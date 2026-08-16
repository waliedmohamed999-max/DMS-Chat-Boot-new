-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('MANUAL', 'IMPORT', 'CAMPAIGN_IMPORT', 'ZID_SYNC', 'SALLA_SYNC');

-- AlterEnum
ALTER TYPE "ContactStage" ADD VALUE 'CONTACTED';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "city" TEXT,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "optInUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "source" "ContactSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceCampaignId" TEXT,
ALTER COLUMN "marketingOptIn" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ContactImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" "ContactSource" NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "updatedCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "errorsJson" JSONB,
    "campaignId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactImportBatch_tenantId_createdAt_idx" ON "ContactImportBatch"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_tenantId_source_idx" ON "Contact"("tenantId", "source");

-- CreateIndex
CREATE INDEX "Contact_tenantId_sourceCampaignId_idx" ON "Contact"("tenantId", "sourceCampaignId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_importBatchId_idx" ON "Contact"("tenantId", "importBatchId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_city_idx" ON "Contact"("tenantId", "city");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ContactImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_sourceCampaignId_fkey" FOREIGN KEY ("sourceCampaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactImportBatch" ADD CONSTRAINT "ContactImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactImportBatch" ADD CONSTRAINT "ContactImportBatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactImportBatch" ADD CONSTRAINT "ContactImportBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

