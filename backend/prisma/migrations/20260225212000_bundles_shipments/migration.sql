DO $$
BEGIN
  CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'READY', 'SHIPPED', 'DELIVERED', 'EXCEPTION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ProductBundle" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bundlePrice" DECIMAL(12,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductBundleItem" (
  "id" TEXT NOT NULL,
  "bundleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductBundleItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Shipment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT,
  "fiscalInvoiceId" TEXT,
  "carrier" TEXT,
  "trackingCode" TEXT,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
  "shippingDate" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductBundleItem_bundleId_productId_key"
ON "ProductBundleItem"("bundleId","productId");

CREATE INDEX IF NOT EXISTS "ProductBundleItem_bundleId_idx"
ON "ProductBundleItem"("bundleId");

CREATE INDEX IF NOT EXISTS "ProductBundleItem_productId_idx"
ON "ProductBundleItem"("productId");

CREATE UNIQUE INDEX IF NOT EXISTS "Shipment_orderId_key"
ON "Shipment"("orderId");

CREATE INDEX IF NOT EXISTS "Shipment_status_idx"
ON "Shipment"("status");

CREATE INDEX IF NOT EXISTS "Shipment_shippingDate_idx"
ON "Shipment"("shippingDate");

ALTER TABLE "ProductBundleItem"
  ADD CONSTRAINT "ProductBundleItem_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "ProductBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductBundleItem"
  ADD CONSTRAINT "ProductBundleItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
