-- CreateEnum
CREATE TYPE "AiTone" AS ENUM ('FORMAL', 'FRIENDLY', 'FUN');

-- CreateEnum
CREATE TYPE "AiReplyRating" AS ENUM ('HELPFUL', 'INACCURATE');

-- DropForeignKey
ALTER TABLE "InternalNote" DROP CONSTRAINT "InternalNote_authorId_fkey";

-- AlterTable
ALTER TABLE "InternalNote" ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SiteContent" ALTER COLUMN "aboutParagraphs" DROP DEFAULT,
ALTER COLUMN "servicesItems" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "aiTokensUsedThisPeriod" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AiAgentConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "agentName" TEXT NOT NULL DEFAULT 'مساعد المتجر',
    "tone" "AiTone" NOT NULL DEFAULT 'FRIENDLY',
    "boundariesText" TEXT,
    "shippingPolicy" TEXT,
    "returnPolicy" TEXT,
    "workingHours" TEXT,
    "faqItems" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReplyLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userMessage" TEXT NOT NULL,
    "aiReply" TEXT,
    "confidenceScore" INTEGER NOT NULL,
    "handoffTriggered" BOOLEAN NOT NULL DEFAULT false,
    "handoffReason" TEXT,
    "usedTool" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL,
    "rating" "AiReplyRating",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReplyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentConfig_tenantId_key" ON "AiAgentConfig"("tenantId");

-- CreateIndex
CREATE INDEX "AiReplyLog_tenantId_createdAt_idx" ON "AiReplyLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AiReplyLog_tenantId_handoffTriggered_idx" ON "AiReplyLog"("tenantId", "handoffTriggered");

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentConfig" ADD CONSTRAINT "AiAgentConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReplyLog" ADD CONSTRAINT "AiReplyLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReplyLog" ADD CONSTRAINT "AiReplyLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

