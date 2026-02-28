-- CreateTable
CREATE TABLE "TreasuryDeposit" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreasuryDeposit_settlementId_idx" ON "TreasuryDeposit"("settlementId");

-- AddForeignKey
ALTER TABLE "TreasuryDeposit" ADD CONSTRAINT "TreasuryDeposit_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "TreasurySettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
