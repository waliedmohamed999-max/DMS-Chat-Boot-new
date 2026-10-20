-- ZATCA المرحلة الثانية: بيانات البائع المفصّلة، بيانات الفاتورة الضريبية للتاجر، وحدة الإصدار، ومستندات الهيئة
ALTER TABLE "PlatformSettings" ADD COLUMN "sellerCrn" TEXT, ADD COLUMN "sellerStreet" TEXT, ADD COLUMN "sellerBuildingNumber" TEXT,
  ADD COLUMN "sellerDistrict" TEXT, ADD COLUMN "sellerCity" TEXT, ADD COLUMN "sellerPostalCode" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "billingLegalName" TEXT, ADD COLUMN "billingVatNumber" TEXT, ADD COLUMN "billingStreet" TEXT,
  ADD COLUMN "billingBuildingNumber" TEXT, ADD COLUMN "billingDistrict" TEXT, ADD COLUMN "billingCity" TEXT, ADD COLUMN "billingPostalCode" TEXT;

CREATE TABLE "ZatcaEgs" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "status" TEXT NOT NULL DEFAULT 'NONE',
  "commonName" TEXT,
  "encryptedPrivateKey" TEXT,
  "encryptedComplianceToken" TEXT,
  "encryptedComplianceSecret" TEXT,
  "complianceRequestId" TEXT,
  "encryptedProductionToken" TEXT,
  "encryptedProductionSecret" TEXT,
  "icv" INTEGER NOT NULL DEFAULT 0,
  "lastInvoiceHash" TEXT,
  "activatedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ZatcaEgs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZatcaDocument" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "docType" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "uuid" TEXT NOT NULL,
  "icv" INTEGER,
  "invoiceHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "xml" TEXT,
  "qrBase64" TEXT,
  "messagesJson" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZatcaDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ZatcaDocument_uuid_key" ON "ZatcaDocument"("uuid");
CREATE UNIQUE INDEX "ZatcaDocument_invoiceId_docType_key" ON "ZatcaDocument"("invoiceId", "docType");
CREATE INDEX "ZatcaDocument_status_idx" ON "ZatcaDocument"("status");
ALTER TABLE "ZatcaDocument" ADD CONSTRAINT "ZatcaDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
