ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "clerkUserId" text;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkUserId_key" ON "User" ("clerkUserId");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
