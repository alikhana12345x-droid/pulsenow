import {
  pgTable, uuid, text, boolean, numeric, timestamp, index,
} from "drizzle-orm/pg-core";
import { profiles } from "./profile";

export const promotions = pgTable("promotions", {
  id:               uuid("id").primaryKey().defaultRandom(),
  title:            text("title").notNull(),
  description:      text("description"),
  type:             text("type").notNull().default("toast"),       // toast | modal | banner
  display_location: text("display_location").notNull().default("lobby"), // lobby | all_games | specific_games
  game_ids:         text("game_ids").array(),                      // ['coinflip','dice','skyrise','hi-lo']
  image_url:        text("image_url"),
  content:          text("content"),
  bg_color:         text("bg_color").default("#0d0b1e"),
  // CTA config — cta_action encodes type + target:
  //   "deposit" | "withdraw" | "game:<id>" | "url:<path>" | null (no button)
  cta_action:       text("cta_action"),
  cta_label:        text("cta_label"),               // null → auto-derived from action type
  show_frequency:   text("show_frequency").notNull().default("always"), // always | once | daily
  is_active:        boolean("is_active").notNull().default(false),
  created_by:       uuid("created_by").references(() => profiles.id),
  created_at:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("promotions_active_idx").on(t.is_active),
  index("promotions_location_idx").on(t.display_location),
]);

export const promotion_players = pgTable("promotion_players", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  user_id:               uuid("user_id").notNull().references(() => profiles.id),
  added_by:              uuid("added_by").references(() => profiles.id),
  notes:                 text("notes"),
  win_probability_boost: numeric("win_probability_boost", { precision: 5, scale: 2 }).notNull().default("0.00"),
  is_active:             boolean("is_active").notNull().default(true),
  created_at:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("promo_players_user_idx").on(t.user_id),
  index("promo_players_active_idx").on(t.is_active),
]);
