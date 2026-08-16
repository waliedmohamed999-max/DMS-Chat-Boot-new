-- إضافة رقم فاتورة تسلسلي (تسلسل Postgres ذاته، آمن ضد التزامن بلا أي قفل إضافي)، ونسبة/مبلغ ضريبة
-- القيمة المضافة لكل فاتورة (للشفافية — لا تغيير على amountSar الفعلي المُحصَّل).
CREATE SEQUENCE "Invoice_invoiceNumber_seq";
ALTER TABLE "Invoice" ADD COLUMN "invoiceNumber" INTEGER NOT NULL DEFAULT nextval('"Invoice_invoiceNumber_seq"');
ALTER SEQUENCE "Invoice_invoiceNumber_seq" OWNED BY "Invoice"."invoiceNumber";
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

ALTER TABLE "Invoice" ADD COLUMN "vatRateBps" INTEGER NOT NULL DEFAULT 1500;
ALTER TABLE "Invoice" ADD COLUMN "vatAmountSar" INTEGER NOT NULL DEFAULT 0;
