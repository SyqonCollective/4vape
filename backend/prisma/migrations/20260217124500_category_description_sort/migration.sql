ALTER TABLE "Category"
  ADD COLUMN IF NOT EXISTS "description" text,
  ADD COLUMN IF NOT EXISTS "sortOrder" integer NOT NULL DEFAULT 0;
