// scripts/seed-games.mjs
// Usage: npm run db:seed-games   (or: node scripts/seed-games.mjs)
// Idempotently seeds the `games` lobby registry from the current catalogue.
// ADDITIVE — uses ON CONFLICT (slug) DO NOTHING, so it never overwrites admin
// edits and is safe to run repeatedly (e.g. after deploying a new game).
// Requires DB_URL in .env.local.

import postgres from "postgres";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ── Load .env.local ──────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const raw = readFileSync(join(__dirname, "../.env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
} catch {
  /* assume env already exported */
}

if (!process.env.DB_URL) throw new Error("Missing env var: DB_URL");
const sql = postgres(process.env.DB_URL, { prepare: false });

// Ensure the table exists (idempotent). Normally `migration:push` creates it, but
// this keeps seeding self-contained — and drizzle-kit push currently crashes
// introspecting this DB's existing CHECK constraints, so we create it directly.
async function ensureTable() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "games" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "slug" text NOT NULL,
      "game_type" text NOT NULL,
      "title" text NOT NULL,
      "subtitle" text DEFAULT '' NOT NULL,
      "emoji" text DEFAULT '' NOT NULL,
      "gradient" text DEFAULT '' NOT NULL,
      "glow" text,
      "payout_label" text,
      "badge" text,
      "featured" boolean DEFAULT false NOT NULL,
      "sort_order" integer DEFAULT 0 NOT NULL,
      "status" text DEFAULT 'hidden' NOT NULL,
      "card_image_url" text,
      "loading_image_url" text,
      "banner_image_url" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "games_slug_unique" UNIQUE("slug")
    )
  `);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "games_status_sort_idx" ON "games" ("status","sort_order")`);
  console.log("  ensured games table exists");
}

// Mirrors LIVE_GAMES in lib/games-catalogue.ts. All start live; Skyrise featured.
const GAMES = [
  { slug: "dice-3d",      game_type: "dice",         title: "Dice 3D",      subtitle: "Predict high or low — 3D rendered",            emoji: "🎯", gradient: "from-purple-600 via-violet-700 to-indigo-900", glow: "rgba(139,92,246,0.35)", payout_label: "Up to 9900×", badge: "LIVE", featured: false, sort_order: 0 },
  { slug: "skyrise",      game_type: "skyrise",      title: "Aviator",      subtitle: "Cash out before it crashes",                   emoji: "✈️", gradient: "from-[#1e0a3c] via-[#0e0c1f] to-[#080613]", glow: "rgba(92,18,178,0.35)", payout_label: "Up to 9900×", badge: "LIVE", featured: true,  sort_order: 1 },
  { slug: "coinflip",     game_type: "coinflip",     title: "Coin Flip",    subtitle: "Heads or tails",                               emoji: "🪙", gradient: "from-amber-500 via-orange-600 to-amber-900", glow: "rgba(245,158,11,0.3)", payout_label: "1.96×", badge: "LIVE", featured: false, sort_order: 2 },
  { slug: "limbo",        game_type: "limbo",        title: "Limbo",        subtitle: "Set a target multiplier and let it fly",       emoji: "📈", gradient: "from-[#241703] via-[#100d1a] to-[#070510]", glow: "rgba(242,154,11,0.32)", payout_label: "Up to 1000×", badge: "NEW", featured: false, sort_order: 3 },
  { slug: "hi-lo",        game_type: "hi-lo",        title: "Hi-Lo",        subtitle: "Higher or lower — read the deck",              emoji: "🃏", gradient: "from-emerald-600 via-teal-700 to-emerald-950", glow: null, payout_label: null, badge: null, featured: false, sort_order: 4 },
  { slug: "mines",        game_type: "mines",        title: "Mines",        subtitle: "Avoid the mines and cash out before it explodes", emoji: "💣", gradient: "from-rose-600 via-pink-700 to-rose-950", glow: null, payout_label: null, badge: null, featured: false, sort_order: 5 },
  { slug: "dragon-tower", game_type: "dragon-tower", title: "Dragon Tower", subtitle: "Climb the tower, dodge the dragons",            emoji: "🐉", gradient: "from-[#2a0f10] via-[#150818] to-[#0c0511]", glow: "rgba(249,115,22,0.32)", payout_label: "Up to 2000×", badge: "NEW", featured: false, sort_order: 6 },
  { slug: "andar-bahar",  game_type: "andar-bahar",  title: "Andar Bahar",  subtitle: "Pick a side — inside or outside",              emoji: "🎴", gradient: "from-emerald-600 via-green-700 to-teal-950", glow: "rgba(16,185,129,0.32)", payout_label: "1.96×", badge: "NEW", featured: false, sort_order: 7 },
  { slug: "plinko",       game_type: "plinko",       title: "Plinko",       subtitle: "Drop the ball, ride the multiplier",           emoji: "🎳", gradient: "from-violet-600 via-purple-700 to-violet-950", glow: "rgba(139,92,246,0.35)", payout_label: "Up to 1000×", badge: "NEW", featured: false, sort_order: 8 },
  { slug: "keno",         game_type: "keno",         title: "Keno",         subtitle: "Pick your numbers, watch them drop",           emoji: "🔢", gradient: "from-indigo-600 via-blue-700 to-indigo-950", glow: "rgba(99,102,241,0.35)", payout_label: "Up to 1000×", badge: "NEW", featured: false, sort_order: 9 },
  { slug: "dragon-tiger", game_type: "dragon-tiger", title: "Dragon vs Tiger", subtitle: "Pick a side — one card decides",            emoji: "🐯", gradient: "from-[#0d1b4b] via-[#160a2e] to-[#5b2a06]", glow: "rgba(245,182,10,0.32)", payout_label: "Up to 9×", badge: "NEW", featured: false, sort_order: 10 },
  { slug: "teen-patti",   game_type: "teen-patti",   title: "Teen Patti",   subtitle: "Two hands, one winner — back a side",          emoji: "🂡", gradient: "from-[#0d3b2e] via-[#123a2c] to-[#07241c]", glow: "rgba(212,160,44,0.32)", payout_label: "Up to 3.70×", badge: "NEW", featured: false, sort_order: 11 },
];

async function main() {
  console.log("\n=== Seeding games registry ===\n");
  await ensureTable();
  let inserted = 0;
  for (const g of GAMES) {
    const res = await sql`
      INSERT INTO games (slug, game_type, title, subtitle, emoji, gradient, glow, payout_label, badge, featured, sort_order, status)
      VALUES (${g.slug}, ${g.game_type}, ${g.title}, ${g.subtitle}, ${g.emoji}, ${g.gradient}, ${g.glow}, ${g.payout_label}, ${g.badge}, ${g.featured}, ${g.sort_order}, 'live')
      ON CONFLICT (slug) DO NOTHING
      RETURNING slug
    `;
    if (res.length > 0) { inserted++; console.log(`  + ${g.slug}`); }
    else console.log(`  · ${g.slug} (exists, skipped)`);
  }
  console.log(`\n✓ Done. Inserted ${inserted} new game(s); ${GAMES.length - inserted} already present.\n`);
}

main()
  .catch((e) => { console.error("\n✗", e.message); process.exit(1); })
  .finally(() => sql.end());
