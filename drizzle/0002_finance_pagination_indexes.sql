CREATE INDEX IF NOT EXISTS "deposits_created_idx" ON "deposits" ("created_at");
CREATE INDEX IF NOT EXISTS "deposits_status_created_idx" ON "deposits" ("status","created_at");
CREATE INDEX IF NOT EXISTS "withdrawals_created_idx" ON "withdrawals" ("created_at");
