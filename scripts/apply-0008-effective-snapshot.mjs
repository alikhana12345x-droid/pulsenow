// One-off: apply drizzle/0008_game_rounds_effective_snapshot.sql (additive, idempotent).
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
  await sql`ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "effective_win_probability" numeric(5,2)`;
  await sql`ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "expected_rtp" numeric(6,4)`;
  const cols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'game_rounds'
      AND column_name IN ('effective_win_probability', 'expected_rtp')
    ORDER BY column_name`;
  console.log("Applied. Columns now present:", cols);
} finally {
  await sql.end();
}
