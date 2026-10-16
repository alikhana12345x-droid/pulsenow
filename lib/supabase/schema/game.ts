import {
  pgTable, uuid, text, integer, numeric, jsonb, timestamp, boolean, index,
} from "drizzle-orm/pg-core";

import { profiles } from "./profile";

export const game_rounds = pgTable("game_rounds", {
  id:               uuid("id").primaryKey().defaultRandom(),
  game_type:        text("game_type").notNull(),
  server_seed:      text("server_seed").notNull(),
  server_seed_hash: text("server_seed_hash").notNull(),
  client_seed:      text("client_seed"),
  nonce:            integer("nonce").notNull(),
  outcome:          jsonb("outcome").notNull(),
  multiplier:       numeric("multiplier", { precision: 10, scale: 4 }),
  house_edge:       numeric("house_edge", { precision: 5, scale: 4 }).notNull(),
  // Snapshotted at placement for promo cost & edge-validation reports (gap #1)
  win_probability:  numeric("win_probability", { precision: 5, scale: 2 }),
  // The win % actually fed to the RNG after house-edge caps (differs from
  // win_probability whenever capWinProbabilityForHouseEdge & co. clamp it).
  // Validation compares realized win frequency against THIS, not the config.
  effective_win_probability: numeric("effective_win_probability", { precision: 5, scale: 2 }),
  // Theoretical EV (payout/stake) of the round under the effective probability,
  // computed per game at placement. Null where no closed-form exists (hi-lo).
  expected_rtp:     numeric("expected_rtp", { precision: 6, scale: 4 }),
  is_promo:         boolean("is_promo").notNull().default(false),
  is_win_round:     boolean("is_win_round"),          // engine's win/loss decision (all decide-first games)
  status:           text("status").notNull().default("pending"),
  created_at:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completed_at:     timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("game_rounds_type_created_idx").on(t.game_type, t.created_at),
]);

// Lobby presentation + availability registry. The `slug` is the contract that maps
// to code (the game component, engine, and card art); everything else here is
// admin-controlled so games can be reordered, featured, relabelled, re-skinned, or
// taken offline without a deploy. Game LOGIC stays in code — this table never drives
// the engine, only what the lobby shows and whether a game can be started.
export const games = pgTable("games", {
  id:                uuid("id").primaryKey().defaultRandom(),
  slug:              text("slug").notNull().unique(),   // = GameSlug in code
  game_type:         text("game_type").notNull(),       // = game_rounds.game_type
  title:             text("title").notNull(),
  subtitle:          text("subtitle").notNull().default(""),
  emoji:             text("emoji").notNull().default(""),
  gradient:          text("gradient").notNull().default(""),
  glow:              text("glow"),
  payout_label:      text("payout_label"),
  badge:             text("badge"),
  featured:          boolean("featured").notNull().default(false),
  sort_order:        integer("sort_order").notNull().default(0),
  // live | coming_soon | maintenance | hidden
  status:            text("status").notNull().default("hidden"),
  card_image_url:    text("card_image_url"),     // optional override of the coded SVG card art
  loading_image_url: text("loading_image_url"),
  banner_image_url:  text("banner_image_url"),
  created_at:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("games_status_sort_idx").on(t.status, t.sort_order),
]);

export const bet_amount_tiers = pgTable("bet_amount_tiers", {
  id:              uuid("id").primaryKey().defaultRandom(),
  label:           text("label").notNull(),
  min_amount:      numeric("min_amount", { precision: 18, scale: 2 }).notNull(),
  max_amount:      numeric("max_amount", { precision: 18, scale: 2 }).notNull(),
  win_probability: integer("win_probability").notNull(),
  is_active:       boolean("is_active").notNull().default(true),
  sort_order:      integer("sort_order").notNull().default(0),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bets = pgTable("bets", {
  id:         uuid("id").primaryKey().defaultRandom(),
  user_id:    uuid("user_id").notNull().references(() => profiles.id),
  round_id:   uuid("round_id").notNull().references(() => game_rounds.id),
  amount:     numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency:   text("currency").notNull(),
  choice:     jsonb("choice"),
  payout:     numeric("payout", { precision: 18, scale: 2 }).notNull().default("0.00"),
  profit:     numeric("profit", { precision: 18, scale: 2 }).notNull(),
  status:     text("status").notNull().default("placed"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("bets_user_created_idx").on(t.user_id, t.created_at),
  index("bets_round_id_idx").on(t.round_id),
]);
