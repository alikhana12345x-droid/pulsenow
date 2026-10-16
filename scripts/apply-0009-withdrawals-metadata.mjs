// One-off: apply drizzle/0009_withdrawals_metadata.sql (additive, idempotent).
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
  await sql`ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "metadata" jsonb`;
  const cols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'withdrawals' AND column_name = 'metadata'`;
  console.log("Applied. Column now present:", cols);
} finally {
  await sql.end();
}
