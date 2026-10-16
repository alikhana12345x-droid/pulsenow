// One-off: apply drizzle/0010_house_payouts.sql (additive, idempotent).
// Repo convention: schema goes live via push/direct DDL; the drizzle/*.sql file is the record.
import pkg from "@next/env";
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import postgres from "postgres";

const url = process.env.DB_URL;
if (!url) {
  console.error("DB_URL not set (expected in .env.local)");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

try {
  await sql`
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
    )`;
  await sql`CREATE INDEX IF NOT EXISTS "house_payouts_status_created_idx" ON "house_payouts" ("status", "created_at")`;
  await sql`CREATE INDEX IF NOT EXISTS "house_payouts_created_idx" ON "house_payouts" ("created_at")`;

  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'house_payouts' ORDER BY ordinal_position`;
  console.log("Applied. house_payouts columns:", cols.map((c) => c.column_name).join(", "));
} finally {
  await sql.end();
}
