-- Repair for 0011_rls_lockdown.sql.
--
-- 0011's premise — "the app never uses the Data API, all data access goes
-- through drizzle on DB_URL" — is not quite true. Three code paths read a
-- profile over PostgREST with the user's own JWT:
--
--   lib/supabase/proxy.ts    role / is_banned / display_name routing gate
--   components/login-form.tsx  post-login redirect (admin -> /admin)
--   app/auth/callback/route.ts OAuth callback redirect
--
-- `REVOKE ALL ON ALL TABLES ... FROM anon, authenticated` made all three fail
-- with "permission denied for table profiles". Because the proxy treats a null
-- profile as "not an admin, no display_name", the effect was:
--
--   * every player hitting /protected was redirected to /protected/onboarding
--     forever — the onboarding POST itself succeeded (drizzle bypasses RLS), but
--     the proxy still could not read display_name, so it bounced straight back;
--   * every admin and superadmin was redirected off /admin to "/" — locked out
--     of the admin panel entirely.
--
-- Fix: grant SELECT on profiles to `authenticated` and add a policy restricting
-- it to the caller's own row. `anon` still gets nothing, no role gets INSERT /
-- UPDATE / DELETE, and every other table stays deny-all — so the hole 0011
-- closed (anon reading all profiles, PATCHing wallets) stays closed. The only
-- thing exposed is a signed-in user's own profile row, to themselves.

GRANT SELECT ON TABLE "profiles" TO authenticated;--> statement-breakpoint

DROP POLICY IF EXISTS "profiles_self_select" ON "profiles";--> statement-breakpoint

CREATE POLICY "profiles_self_select" ON "profiles"
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());
