CREATE TABLE IF NOT EXISTS "Brand" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
