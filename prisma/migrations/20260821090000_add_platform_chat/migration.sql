-- CreateEnum
CREATE TYPE "PlatformChatSessionStatus" AS ENUM ('OPEN', 'HANDED_OFF', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlatformChatSenderType" AS ENUM ('VISITOR', 'AI', 'STAFF');

-- CreateTable
CREATE TABLE "PlatformChatSession" (
    "id" TEXT NOT NULL,
    "status" "PlatformChatSessionStatus" NOT NULL DEFAULT 'OPEN',
    "visitorName" TEXT,
    "visitorEmail" TEXT,
    "assignedToUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "senderType" "PlatformChatSenderType" NOT NULL,
    "text" TEXT NOT NULL,
    "wasVoice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformChatSession_status_idx" ON "PlatformChatSession"("status");

-- CreateIndex
CREATE INDEX "PlatformChatSession_lastMessageAt_idx" ON "PlatformChatSession"("lastMessageAt");

-- CreateIndex
CREATE INDEX "PlatformChatMessage_sessionId_createdAt_idx" ON "PlatformChatMessage"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformChatSession" ADD CONSTRAINT "PlatformChatSession_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformChatMessage" ADD CONSTRAINT "PlatformChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PlatformChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "platformChatEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "platformChatVoiceReplyEnabled" BOOLEAN NOT NULL DEFAULT false;
