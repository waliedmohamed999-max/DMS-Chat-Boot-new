-- دفع الاشتراكات عبر صفحة Moyasar
ALTER TABLE "Invoice" ADD COLUMN "providerInvoiceId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "checkoutJson" JSONB;
CREATE UNIQUE INDEX "Invoice_providerInvoiceId_key" ON "Invoice"("providerInvoiceId");
