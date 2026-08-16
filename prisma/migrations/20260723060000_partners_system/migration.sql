-- AlterEnum
ALTER TYPE "ApprovalRequestType" ADD VALUE 'PARTNER_APPLICATION';

-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "applicantEmail" TEXT,
ALTER COLUMN "tenantId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PartnerSetupToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerSetupToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerSetupToken_tokenHash_key" ON "PartnerSetupToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PartnerSetupToken_userId_idx" ON "PartnerSetupToken"("userId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_applicantEmail_idx" ON "ApprovalRequest"("applicantEmail");

-- AddForeignKey
ALTER TABLE "PartnerSetupToken" ADD CONSTRAINT "PartnerSetupToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

