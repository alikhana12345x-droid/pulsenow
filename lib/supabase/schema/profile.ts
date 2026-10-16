import {
  pgTable, uuid, text, boolean, integer, numeric, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id:            uuid("id").primaryKey(),
  username:      text("username").unique(),
  display_name:  text("display_name"),
  avatar_url:    text("avatar_url"),
  phone:         text("phone"),
  role:          text("role").notNull().default("player"),
  is_banned:     boolean("is_banned").notNull().default(false),
  ban_reason:    text("ban_reason"),
  kyc_status:    text("kyc_status").notNull().default("none"),
  // Admin-set percentage (0–100) shown on the player's profile.
  health:        integer("health").notNull().default(50),
  // Admin hold: withdrawals are still recorded (balance reserved) but never
  // sent to the gateway — each waits on the Finance desk to be paid or rejected.
  withdrawals_held: boolean("withdrawals_held").notNull().default(false),
  referral_code: text("referral_code").notNull().unique(),
  referred_by:   uuid("referred_by").references((): any => profiles.id),
  created_at:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("profiles_referral_code_idx").on(t.referral_code),
  index("profiles_is_banned_idx").on(t.is_banned),
]);

export const wallets = pgTable("wallets", {
  id:               uuid("id").primaryKey().defaultRandom(),
  user_id:          uuid("user_id").notNull().references(() => profiles.id),
  currency:         text("currency").notNull().default("PKR"),
  balance:          numeric("balance", { precision: 18, scale: 2 }).notNull().default("0.00"),
  total_deposited:  numeric("total_deposited", { precision: 18, scale: 2 }).notNull().default("0.00"),
  total_withdrawn:  numeric("total_withdrawn", { precision: 18, scale: 2 }).notNull().default("0.00"),
  total_wagered:    numeric("total_wagered", { precision: 18, scale: 2 }).notNull().default("0.00"),
  total_won:        numeric("total_won", { precision: 18, scale: 2 }).notNull().default("0.00"),
  is_locked:        boolean("is_locked").notNull().default(false),
  created_at:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("wallets_user_currency_unique").on(t.user_id, t.currency),
  index("wallets_user_currency_idx").on(t.user_id, t.currency),
]);
