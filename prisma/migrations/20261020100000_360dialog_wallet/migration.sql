-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'D360DIALOG';

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "channelId" TEXT,
ADD COLUMN     "webhookTokenHash" TEXT;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "walletMarkupBps" INTEGER NOT NULL DEFAULT 3000,
ADD COLUMN     "walletMinRechargeSar" INTEGER NOT NULL DEFAULT 200;

-- CreateTable
CREATE TABLE "WalletBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "balance" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "minAlert" DECIMAL(14,4) NOT NULL DEFAULT 50,
    "lowBalanceNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "balanceAfter" DECIMAL(14,4) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT,
    "category" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "baseCost" DECIMAL(14,4) NOT NULL,
    "cost" DECIMAL(14,4) NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRate" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "baseRateSar" DECIMAL(14,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletBalance_tenantId_key" ON "WalletBalance"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_idempotencyKey_key" ON "WalletTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletTransaction_tenantId_createdAt_idx" ON "WalletTransaction"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageUsage_tenantId_createdAt_idx" ON "MessageUsage"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageRate_country_category_key" ON "MessageRate"("country", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_channelId_key" ON "Integration"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_webhookTokenHash_key" ON "Integration"("webhookTokenHash");

-- AddForeignKey
ALTER TABLE "WalletBalance" ADD CONSTRAINT "WalletBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageUsage" ADD CONSTRAINT "MessageUsage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- عزل المستأجرين (RLS) للجداول الجديدة — نفس سياسة prisma/postgres-rls.sql حرفياً، مضمَّنة هنا لأن
-- الـmigrations تُطبَّق تلقائياً مع كل نشر بينما سكربت RLS يُشغَّل يدوياً.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['WalletBalance', 'WalletTransaction', 'MessageUsage'] LOOP
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
