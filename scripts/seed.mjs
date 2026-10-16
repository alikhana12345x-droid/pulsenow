// scripts/seed.mjs
// Usage: npm run db:seed
// Deletes ALL data from the database and auth, then creates two seed users.
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local

import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

// ── Load .env.local ──────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../.env.local");
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // .env.local not found — assume vars are already exported
}

// ── Validate required env vars ───────────────────────────────────────────────
const {
  DB_URL,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

if (!DB_URL) throw new Error("Missing env var: DB_URL");
if (!NEXT_PUBLIC_SUPABASE_URL) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing env var: SUPABASE_SERVICE_ROLE_KEY\n" +
    "Add it to .env.local — find it in Supabase → Project Settings → API → service_role key"
  );
}

// ── Clients ──────────────────────────────────────────────────────────────────
const sql = postgres(DB_URL, { prepare: false });
const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function genReferralCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

// ── Steps ────────────────────────────────────────────────────────────────────
async function deleteAllAuthUsers() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  for (const user of data.users) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
    if (delErr) console.warn(`  warn: could not delete auth user ${user.email}: ${delErr.message}`);
  }
  console.log(`  deleted ${data.users.length} auth user(s)`);
}

async function truncateAllTables() {
  // Single TRUNCATE CASCADE handles all FK deps in one shot
  await sql`
    TRUNCATE
      referral_earnings,
      admin_audit_log,
      promotion_players,
      promotions,
      bets,
      game_rounds,
      referrals,
      transactions,
      deposits,
      withdrawals,
      wallets,
      payment_accounts,
      profiles,
      bet_amount_tiers
    RESTART IDENTITY CASCADE
  `;
  console.log("  truncated all tables");
}

async function createSeedUser(email, password, role, displayName) {
  // 1. Create Supabase auth user (email already confirmed)
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) throw new Error(`createUser(${email}) failed: ${authErr.message}`);

  const userId = authData.user.id;
  const username = `player_${userId.replace(/-/g, "").slice(0, 8)}`;
  const referralCode = genReferralCode();

  // 2. Insert profile row
  await sql`
    INSERT INTO profiles (id, username, display_name, role, referral_code)
    VALUES (${userId}, ${username}, ${displayName}, ${role}, ${referralCode})
  `;

  // 3. Insert wallet row
  await sql`
    INSERT INTO wallets (id, user_id, currency)
    VALUES (gen_random_uuid(), ${userId}, 'PKR')
  `;

  console.log(`  created: ${email}  role=${role}  id=${userId}`);
}

async function seedBetAmountTiers() {
  await sql`
    INSERT INTO bet_amount_tiers (label, min_amount, max_amount, win_probability, sort_order)
    VALUES
      ('Basic',       10,   50,   35, 0),
      ('Standard',    51,   200,  25, 1),
      ('Medium',      201,  999,  15, 2),
      ('High Roller', 1000, 20000, 1, 3)
  `;
  console.log("  seeded 4 bet amount tiers");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n=== BetPulse DB Seed ===\n");

  console.log("[1/4] Removing auth users...");
  await deleteAllAuthUsers();

  console.log("[2/4] Clearing all tables...");
  await truncateAllTables();

  console.log("[3/4] Creating seed users...");
  await createSeedUser("player@gmail.com",  "12345xyz", "player",     "Player One");
  await createSeedUser("admin@gmail.com",   "12345xyz", "admin", "Admin");
  await createSeedUser("niazi@gmail.com",   "12345xyz", "superadmin", "Super Admin");

  console.log("[4/4] Seeding bet amount tiers...");
  await seedBetAmountTiers();

  console.log("\n✓ Seed complete!\n");
  console.log("  player@gmail.com  / 12345xyz  (player)");
  console.log("  admin@gmail.com   / 12345xyz  (admin)");
  console.log("  niazi@gmail.com   / 12345xyz  (superadmin)\n");
}

main()
  .catch((e) => {
    console.error("\n✗", e.message);
    process.exit(1);
  })
  .finally(() => sql.end());
