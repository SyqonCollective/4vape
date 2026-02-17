DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER','CARD','COD','OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "groupName" text;

ALTER TABLE "Supplier"
  ADD COLUMN IF NOT EXISTS "legalName" text,
  ADD COLUMN IF NOT EXISTS "vatNumber" text,
  ADD COLUMN IF NOT EXISTS "taxCode" text,
  ADD COLUMN IF NOT EXISTS "sdiCode" text,
  ADD COLUMN IF NOT EXISTS "pec" text,
  ADD COLUMN IF NOT EXISTS "address" text,
  ADD COLUMN IF NOT EXISTS "cap" text,
  ADD COLUMN IF NOT EXISTS "city" text,
  ADD COLUMN IF NOT EXISTS "province" text,
  ADD COLUMN IF NOT EXISTS "country" text,
  ADD COLUMN IF NOT EXISTS "phone" text,
  ADD COLUMN IF NOT EXISTS "email" text;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "orderNumber" serial,
  ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER';

DO $$ BEGIN
  ALTER TABLE "Order"
    ADD CONSTRAINT "Order_orderNumber_key" UNIQUE ("orderNumber");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Discount"
  ADD COLUMN IF NOT EXISTS "code" text,
  ADD COLUMN IF NOT EXISTS "minSpend" numeric(12,2);

DO $$ BEGIN
  CREATE UNIQUE INDEX "Discount_code_key" ON "Discount"("code");
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

ALTER TABLE "GoodsReceipt"
  ADD COLUMN IF NOT EXISTS "supplierId" text;

DO $$ BEGIN
  ALTER TABLE "GoodsReceipt"
    ADD CONSTRAINT "GoodsReceipt_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
