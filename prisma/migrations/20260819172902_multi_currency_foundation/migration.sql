-- CreateEnum
CREATE TYPE "Country" AS ENUM ('SA', 'AE', 'EG');

-- AlterTable
ALTER TABLE "CreditNote" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR';

-- AlterTable
ALTER TABLE "JournalLine" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR';

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "pricingJson" JSONB;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "country" "Country" NOT NULL DEFAULT 'SA';

-- CreateTable
CREATE TABLE "CountryConfig" (
    "id" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "currency" TEXT NOT NULL,
    "currencyLabel" TEXT NOT NULL,
    "vatRateBps" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CountryConfig_country_key" ON "CountryConfig"("country");

