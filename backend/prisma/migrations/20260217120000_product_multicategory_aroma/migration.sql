ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "categoryIds" jsonb,
  ADD COLUMN IF NOT EXISTS "subcategories" jsonb,
  ADD COLUMN IF NOT EXISTS "aroma" text;
