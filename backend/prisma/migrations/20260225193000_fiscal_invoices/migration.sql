-- CreateTable
CREATE TABLE "FiscalInvoice" (
  "id" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "orderId" TEXT,
  "companyId" TEXT NOT NULL,
  "exerciseNumber" TEXT,
  "cmnr" TEXT,
  "signNumber" TEXT,
  "legalName" TEXT,
  "city" TEXT,
  "province" TEXT,
  "adminVatNumber" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalInvoiceLine" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "productId" TEXT,
  "sku" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "codicePl" TEXT,
  "mlProduct" DECIMAL(12,3),
  "nicotine" DECIMAL(12,3),
  "qty" INTEGER NOT NULL,
  "unitGross" DECIMAL(12,4) NOT NULL,
  "exciseUnit" DECIMAL(12,6) NOT NULL,
  "exciseTotal" DECIMAL(12,6) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalInvoice_invoiceNumber_key" ON "FiscalInvoice"("invoiceNumber");
CREATE UNIQUE INDEX "FiscalInvoice_orderId_key" ON "FiscalInvoice"("orderId");
CREATE INDEX "FiscalInvoice_issuedAt_idx" ON "FiscalInvoice"("issuedAt");
CREATE INDEX "FiscalInvoice_companyId_idx" ON "FiscalInvoice"("companyId");
CREATE INDEX "FiscalInvoiceLine_invoiceId_idx" ON "FiscalInvoiceLine"("invoiceId");
CREATE INDEX "FiscalInvoiceLine_productId_idx" ON "FiscalInvoiceLine"("productId");
CREATE INDEX "FiscalInvoiceLine_sku_idx" ON "FiscalInvoiceLine"("sku");

-- AddForeignKey
ALTER TABLE "FiscalInvoice"
  ADD CONSTRAINT "FiscalInvoice_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FiscalInvoice"
  ADD CONSTRAINT "FiscalInvoice_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FiscalInvoiceLine"
  ADD CONSTRAINT "FiscalInvoiceLine_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "FiscalInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FiscalInvoiceLine"
  ADD CONSTRAINT "FiscalInvoiceLine_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
