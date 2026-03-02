-- AlterTable: add BRT-specific fields to Shipment
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtParcelId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtTrackingId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtNumericRef" INTEGER;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtAlphanumericRef" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtSeriesNumber" INTEGER;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtDepartureDepot" INTEGER;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtArrivalDepot" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtDeliveryZone" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtLabelPdf" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtServiceType" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtNumberOfParcels" INTEGER;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtWeightKG" DECIMAL(7,1);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtCodAmount" DECIMAL(12,2);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtInsuranceAmount" DECIMAL(12,2);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtLastEvent" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "brtLastEventDate" TIMESTAMP(3);

-- Set default carrier to BRT for existing rows
ALTER TABLE "Shipment" ALTER COLUMN "carrier" SET DEFAULT 'BRT';

-- Indexes
CREATE INDEX IF NOT EXISTS "Shipment_brtParcelId_idx" ON "Shipment"("brtParcelId");
CREATE INDEX IF NOT EXISTS "Shipment_brtTrackingId_idx" ON "Shipment"("brtTrackingId");
