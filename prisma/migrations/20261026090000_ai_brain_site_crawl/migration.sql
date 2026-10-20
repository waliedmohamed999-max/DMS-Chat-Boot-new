-- AlterEnum
ALTER TYPE "KnowledgeQaOrigin" ADD VALUE 'FROM_WEBSITE';

-- AlterTable
ALTER TABLE "KnowledgeSource" ADD COLUMN     "siteRoot" TEXT;

-- CreateIndex
CREATE INDEX "KnowledgeSource_tenantId_siteRoot_idx" ON "KnowledgeSource"("tenantId", "siteRoot");

