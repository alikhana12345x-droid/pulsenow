-- House profit withdrawals from the payment gateway. Separate from the player
-- `withdrawals` table on purpose: no player, no wallet, no balance to deduct,
-- and mixing them in would corrupt every finance report.
CREATE TABLE IF NOT EXISTS "house_payouts" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "amount"         numeric(18, 2) NOT NULL,
  "currency"       text DEFAULT 'PKR' NOT NULL,
  "method"         text NOT NULL,
  "acct_code"      text NOT NULL,
  "acct_no"        text NOT NULL,
  "acct_name"      text NOT NULL,
  "mobile"         text,
  "status"         text DEFAULT 'processing' NOT NULL,
  "gateway_ref"    text,
  "failure_reason" text,
  "requested_by"   uuid NOT NULL REFERENCES "profiles"("id"),
  "note"           text,
  "metadata"       jsonb,
  "created_at"     timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at"   timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "house_payouts_status_created_idx" ON "house_payouts" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "house_payouts_created_idx" ON "house_payouts" ("created_at");
