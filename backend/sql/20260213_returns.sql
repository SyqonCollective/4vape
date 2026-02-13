DO $$ BEGIN
  CREATE TYPE "ReturnStatus" AS ENUM ('PENDING','HANDLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ReturnRequest" (
  "id" text PRIMARY KEY,
  "orderNumber" text NOT NULL,
  "productName" text NOT NULL,
  "problemDescription" text NOT NULL,
  "contactName" text,
  "contactEmail" text,
  "status" "ReturnStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "handledAt" timestamptz,
  "companyId" text,
  "userId" text,
  "handledById" text
);

CREATE TABLE IF NOT EXISTS "ReturnRequestImage" (
  "id" text PRIMARY KEY,
  "requestId" text NOT NULL,
  "url" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "ReturnRequest"
  ADD CONSTRAINT "ReturnRequest_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ReturnRequest"
  ADD CONSTRAINT "ReturnRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ReturnRequest"
  ADD CONSTRAINT "ReturnRequest_handledById_fkey"
  FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ReturnRequestImage"
  ADD CONSTRAINT "ReturnRequestImage_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "ReturnRequest_createdAt_idx" ON "ReturnRequest" ("createdAt");
CREATE INDEX IF NOT EXISTS "ReturnRequest_status_idx" ON "ReturnRequest" ("status");
CREATE INDEX IF NOT EXISTS "ReturnRequestImage_requestId_idx" ON "ReturnRequestImage" ("requestId");

GRANT ALL PRIVILEGES ON TABLE "ReturnRequest", "ReturnRequestImage" TO "4vape";
