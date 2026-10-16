// One-off: apply drizzle/0012_profiles_self_select.sql (idempotent).
// Repo convention: schema goes live via push/direct DDL; the drizzle/*.sql file is the record.
//
// Repairs 0011_rls_lockdown.sql, which revoked the grants the proxy's role/
// display_name gate needs — leaving players stuck in the onboarding redirect
// loop and admins locked out of /admin.
//
// Run against whichever project DB_URL points at:  node scripts/apply-0012-profiles-self-select.mjs
// To undo:  DROP POLICY "profiles_self_select" ON "profiles";
//           REVOKE SELECT ON TABLE "profiles" FROM authenticated;
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

  await sql`GRANT SELECT ON TABLE "profiles" TO authenticated`;
  console.log("  granted SELECT on profiles to authenticated");

  await sql`DROP POLICY IF EXISTS "profiles_self_select" ON "profiles"`;
  await sql`
    CREATE POLICY "profiles_self_select" ON "profiles"
      FOR SELECT TO authenticated USING (id = auth.uid())
  `;
  console.log("  created policy profiles_self_select (id = auth.uid())");

  // ── Verify the blast radius is exactly one table, read-only, own row ──
  const grants = await sql`
    SELECT table_name, privilege_type, grantee
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
    ORDER BY table_name, grantee, privilege_type
  `;
  console.log(
    grants.length
      ? `\n  anon/authenticated grants now: ${grants
          .map((g) => `${g.grantee}:${g.privilege_type} on ${g.table_name}`)
          .join(", ")}`
      : "\n  ! no grants found — the policy will have no effect"
  );

  const policies = await sql`
    SELECT tablename, policyname, cmd, qual
    FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname
  `;
  console.log(`  policies in public: ${policies.length ? policies.map((p) => `${p.tablename}.${p.policyname} (${p.cmd})`).join(", ") : "none"}`);

  const noRls = await sql`
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
  `;
  console.log(
    noRls.length
      ? `  ! tables without RLS: ${noRls.map((r) => r.relname).join(", ")}`
      : "  all public tables still have RLS enabled"
  );
} finally {
  await sql.end();
}
