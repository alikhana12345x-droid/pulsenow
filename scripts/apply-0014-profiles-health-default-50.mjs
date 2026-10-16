// One-off: apply drizzle/0014_profiles_health_default_50.sql (idempotent).
// Repo convention: schema goes live via push/direct DDL; the drizzle/*.sql file is the record.
//
// Run against whichever project DB_URL points at:  node scripts/apply-0014-profiles-health-default-50.mjs
// To undo the default:  ALTER TABLE "profiles" ALTER COLUMN "health" SET DEFAULT 100;
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
  console.log(`host: ${new URL(url).hostname}\n`);

  await sql`ALTER TABLE "profiles" ALTER COLUMN "health" SET DEFAULT 50`;
  // Only rows still on the old default — anything an admin set is left alone.
  const moved = await sql`
    UPDATE "profiles" p SET "health" = 50
    WHERE p."health" = 100
      AND NOT EXISTS (
        SELECT 1 FROM "admin_audit_log" a
        WHERE a."action" = 'set_health' AND a."target_id"::text = p."id"::text
      )
    RETURNING p."id"`;
  console.log(`Moved ${moved.length} profile(s) from 100 to 50.`);

  const [col] = await sql`
    SELECT column_default FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'health'`;
  console.log("Column default now:", col?.column_default);

  const spread = await sql`
    SELECT "health", COUNT(*)::int AS profiles FROM "profiles" GROUP BY "health" ORDER BY "health"`;
  console.log("Health values:", spread);
} finally {
  await sql.end();
}
