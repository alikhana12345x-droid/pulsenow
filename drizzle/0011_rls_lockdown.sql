-- Deny-all RLS on every public table.
--
-- Why: the browser ships NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and with RLS off
-- Supabase's default grants let the `anon` role read AND write every table over
-- PostgREST (verified: GET /rest/v1/profiles returned rows, PATCH /rest/v1/wallets
-- returned 204). The app never uses the Data API — @supabase/ssr clients are used
-- only for auth (GoTrue), all data access goes through drizzle on DB_URL — so
-- enabling RLS with no policies closes the hole without touching any code path.
--
-- The app is unaffected: `postgres` owns these tables and owners bypass RLS
-- (no FORCE), and `service_role` carries BYPASSRLS.
--
-- Belt and braces: also revoke the blanket grants, so a future policy added by
-- mistake still can't expose a table.

ALTER TABLE "admin_audit_log"   ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bet_amount_tiers"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bets"              ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deposits"          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "game_rounds"       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "games"             ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "house_payouts"     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_accounts"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles"          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "promotion_players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "promotions"        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "referral_earnings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "referrals"         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions"      ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallets"           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "withdrawals"       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM anon, authenticated;
