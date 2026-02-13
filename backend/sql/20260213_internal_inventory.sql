CREATE TABLE IF NOT EXISTS "InternalInventoryItem" (
  "id" text PRIMARY KEY,
  "sku" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "shortDescription" text,
  "brand" text,
  "category" text,
  "subcategory" text,
  "barcode" text,
  "nicotine" numeric(12,3),
  "mlProduct" numeric(12,3),
  "purchasePrice" numeric(12,2),
  "listPrice" numeric(12,2),
  "price" numeric(12,2),
  "stockQty" integer NOT NULL DEFAULT 0,
  "taxRateId" text,
  "exciseRateId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "GoodsReceipt" (
  "id" text PRIMARY KEY,
  "receiptNo" text NOT NULL UNIQUE,
  "supplierName" text,
  "reference" text,
  "notes" text,
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdById" text
);

CREATE TABLE IF NOT EXISTS "GoodsReceiptLine" (
  "id" text PRIMARY KEY,
  "receiptId" text NOT NULL,
  "itemId" text NOT NULL,
  "sku" text NOT NULL,
  "name" text NOT NULL,
  "qty" integer NOT NULL,
  "unitCost" numeric(12,2),
  "unitPrice" numeric(12,2),
  "lineNote" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "InternalInventoryItem"
  ADD CONSTRAINT "InternalInventoryItem_taxRateId_fkey"
  FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "InternalInventoryItem"
  ADD CONSTRAINT "InternalInventoryItem_exciseRateId_fkey"
  FOREIGN KEY ("exciseRateId") REFERENCES "ExciseRate"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "GoodsReceipt"
  ADD CONSTRAINT "GoodsReceipt_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "GoodsReceiptLine"
  ADD CONSTRAINT "GoodsReceiptLine_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "GoodsReceiptLine"
  ADD CONSTRAINT "GoodsReceiptLine_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InternalInventoryItem"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "GoodsReceiptLine_receiptId_idx" ON "GoodsReceiptLine" ("receiptId");
CREATE INDEX IF NOT EXISTS "GoodsReceiptLine_itemId_idx" ON "GoodsReceiptLine" ("itemId");

GRANT ALL PRIVILEGES ON TABLE "InternalInventoryItem", "GoodsReceipt", "GoodsReceiptLine" TO "4vape";
