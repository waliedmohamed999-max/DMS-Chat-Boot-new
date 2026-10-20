-- CreateEnum
CREATE TYPE "KnowledgeSourceKind" AS ENUM ('TEXT', 'URL', 'FILE');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "KnowledgeQaOrigin" AS ENUM ('MANUAL', 'IMPORTED_FAQ', 'FROM_REVIEW', 'FROM_AGENT');

-- CreateEnum
CREATE TYPE "KnowledgeQaStatus" AS ENUM ('ACTIVE', 'PENDING');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "aiSummaryUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AiAgentConfig" ADD COLUMN     "directAnswers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "learnFromAgents" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rememberCustomers" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "AiReplyLog" ADD COLUMN     "answerSource" TEXT NOT NULL DEFAULT 'llm',
ADD COLUMN     "knowledgeUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "KnowledgeSourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'PROCESSING',
    "error" TEXT,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeQa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "embedding" BYTEA,
    "origin" "KnowledgeQaOrigin" NOT NULL DEFAULT 'MANUAL',
    "status" "KnowledgeQaStatus" NOT NULL DEFAULT 'ACTIVE',
    "directReply" BOOLEAN NOT NULL DEFAULT true,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeQa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMemory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeSource_tenantId_createdAt_idx" ON "KnowledgeSource"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_tenantId_idx" ON "KnowledgeChunk"("tenantId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_sourceId_position_idx" ON "KnowledgeChunk"("sourceId", "position");

-- CreateIndex
CREATE INDEX "KnowledgeQa_tenantId_status_idx" ON "KnowledgeQa"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ContactMemory_tenantId_idx" ON "ContactMemory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactMemory_contactId_key_key" ON "ContactMemory"("contactId", "key");

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeQa" ADD CONSTRAINT "KnowledgeQa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMemory" ADD CONSTRAINT "ContactMemory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMemory" ADD CONSTRAINT "ContactMemory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- عزل المستأجرين (RLS) للجداول الجديدة — نفس سياسة prisma/postgres-rls.sql حرفياً.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['KnowledgeSource', 'KnowledgeChunk', 'KnowledgeQa', 'ContactMemory'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', t);
    EXECUTE format(
      $f$CREATE POLICY tenant_isolation_policy ON %I
        USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_user = 'app_superadmin')
        WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_user = 'app_superadmin');$f$,
      t
    );
  END LOOP;
END $$;
