-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "activeFlowId" TEXT,
ADD COLUMN     "currentNodeId" TEXT,
ADD COLUMN     "flowNodeEnteredAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_activeFlowId_fkey" FOREIGN KEY ("activeFlowId") REFERENCES "ChatbotFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

