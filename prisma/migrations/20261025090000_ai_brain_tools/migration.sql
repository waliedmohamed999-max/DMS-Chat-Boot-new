-- AlterEnum
ALTER TYPE "KnowledgeQaOrigin" ADD VALUE 'GENERATED';

-- AlterTable
ALTER TABLE "KnowledgeSource" ADD COLUMN "contentHash" TEXT,
ADD COLUMN "refreshedAt" TIMESTAMP(3);
