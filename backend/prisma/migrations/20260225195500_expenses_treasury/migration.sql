-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "TreasurySourceType" AS ENUM ('FISCAL_INVOICE', 'GOODS_RECEIPT', 'EXPENSE_INVOICE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExpenseInvoice" (
  "id" TEXT NOT NULL,
  "invoiceNo" TEXT NOT NULL,
  "expenseDate" TIMESTAMP(3) NOT NULL,
  "supplier" TEXT,
  "supplierId" TEXT,
  "category" TEXT,
  "amountNet" DECIMAL(12,2) NOT NULL,
  "vat" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TreasurySettlement" (
  "id" TEXT NOT NULL,
  "sourceType" "TreasurySourceType" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "paid" BOOLEAN NOT NULL DEFAULT false,
  "paidAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreasurySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TreasurySettlement_sourceType_sourceId_key"
  ON "TreasurySettlement"("sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS "TreasurySettlement_sourceType_sourceId_idx"
  ON "TreasurySettlement"("sourceType", "sourceId");
