-- AlterTable
ALTER TABLE "Referral" ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "ReferralClick" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferralClick_affiliateId_createdAt_idx" ON "ReferralClick"("affiliateId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralClick_affiliateId_source_idx" ON "ReferralClick"("affiliateId", "source");

-- AddForeignKey
ALTER TABLE "ReferralClick" ADD CONSTRAINT "ReferralClick_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
