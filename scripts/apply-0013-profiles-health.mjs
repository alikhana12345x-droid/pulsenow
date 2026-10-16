// One-off: apply drizzle/0013_profiles_health.sql (additive, idempotent).
// Repo convention: schema goes live via push/direct DDL; the drizzle/*.sql file is the record.
//
// Run against whichever project DB_URL points at:  node scripts/apply-0013-profiles-health.mjs
// To undo:  ALTER TABLE "profiles" DROP COLUMN "health";
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

  await sql`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "health" integer DEFAULT 100 NOT NULL`;
  const cols = await sql`
    SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'health'`;
  console.log("Applied. Column now present:", cols);

  const spread = await sql`
    SELECT "health", COUNT(*)::int AS profiles FROM "profiles" GROUP BY "health" ORDER BY "health"`;
  console.log("Health values:", spread);

  // Health is only admin-controlled if players can't write profiles directly
  // over PostgREST — see 0011_rls_lockdown.sql.
  const [guard] = await sql`
    SELECT c.relrowsecurity AS rls,
           has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_can_update
    FROM pg_class c WHERE c.oid = 'public.profiles'::regclass`;
  console.log(
    `profiles: RLS ${guard.rls ? "on" : "off"}, authenticated UPDATE grant ${guard.authenticated_can_update ? "yes" : "no"}`
  );
} finally {
  await sql.end();
}
