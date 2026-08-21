-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "voiceCallMinutesUsedThisPeriod" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AiAgentConfig" ADD COLUMN     "websiteWidgetActive" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "TenantChatSessionStatus" AS ENUM ('OPEN', 'HANDED_OFF', 'CLOSED');

-- CreateEnum
CREATE TYPE "TenantChatSenderType" AS ENUM ('VISITOR', 'AI', 'STAFF');

-- CreateTable
CREATE TABLE "TenantChatSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "TenantChatSessionStatus" NOT NULL DEFAULT 'OPEN',
    "visitorName" TEXT,
    "visitorEmail" TEXT,
    "assignedToUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "senderType" "TenantChatSenderType" NOT NULL,
    "text" TEXT NOT NULL,
    "wasVoice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantChatSession_tenantId_status_idx" ON "TenantChatSession"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantChatSession_tenantId_lastMessageAt_idx" ON "TenantChatSession"("tenantId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "TenantChatMessage_tenantId_sessionId_createdAt_idx" ON "TenantChatMessage"("tenantId", "sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "TenantChatSession" ADD CONSTRAINT "TenantChatSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantChatSession" ADD CONSTRAINT "TenantChatSession_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantChatMessage" ADD CONSTRAINT "TenantChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantChatMessage" ADD CONSTRAINT "TenantChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TenantChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
