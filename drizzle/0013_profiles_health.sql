-- Player health: an admin-set percentage shown on the player's profile. Every
-- account starts at 100; admins change it from the Users table.
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "health" integer DEFAULT 100 NOT NULL;
