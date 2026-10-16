// One-off: apply drizzle/0011_rls_lockdown.sql (idempotent, reversible).
// Repo convention: schema goes live via push/direct DDL; the drizzle/*.sql file is the record.
//
// Run against whichever project DB_URL points at:  node scripts/apply-0011-rls-lockdown.mjs
// To undo:  ALTER TABLE "<t>" DISABLE ROW LEVEL SECURITY;  (plus re-GRANT if needed)
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

  const tables = await sql`
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`;

  for (const { relname } of tables) {
    await sql.unsafe(`ALTER TABLE "${relname}" ENABLE ROW LEVEL SECURITY`);
    console.log(`  RLS on  ${relname}`);
  }

  await sql`REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM anon, authenticated`;
  await sql`ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM anon, authenticated`;
  console.log("\n  revoked anon/authenticated table grants (current + future)");

  const open = await sql`
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false`;
  console.log(open.length
    ? `\n! still without RLS: ${open.map((r) => r.relname).join(", ")}`
    : `\nAll ${tables.length} public tables now have RLS enabled (no policies = deny all).`);
} finally {
  await sql.end();
}
