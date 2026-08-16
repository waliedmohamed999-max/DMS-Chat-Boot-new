-- AlterTable
ALTER TABLE "ChatbotFlow" ADD COLUMN     "lastTestedAt" TIMESTAMP(3),
ADD COLUMN     "nodeTraversalJson" JSONB,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "testRunCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "chatbotLimitsJson" JSONB;
