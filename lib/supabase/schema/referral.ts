import {
  pgTable, uuid, text, numeric, jsonb, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";

import { profiles } from "./profile";
import { bets } from "./game";

export const referrals = pgTable("referrals", {
  id:              uuid("id").primaryKey().defaultRandom(),
  referrer_id:     uuid("referrer_id").notNull().references(() => profiles.id),
  referred_id:     uuid("referred_id").notNull().unique().references(() => profiles.id),
  commission_rate: numeric("commission_rate", { precision: 5, scale: 4 }).notNull().default("0.05"),
  total_earned:    numeric("total_earned", { precision: 18, scale: 2 }).notNull().default("0.00"),
  status:          text("status").notNull().default("active"),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("referrals_referrer_id_idx").on(t.referrer_id),
  uniqueIndex("referrals_referred_id_unique").on(t.referred_id),
]);

export const referral_earnings = pgTable("referral_earnings", {
  id:          uuid("id").primaryKey().defaultRandom(),
  referral_id: uuid("referral_id").notNull().references(() => referrals.id),
  bet_id:      uuid("bet_id").notNull().references(() => bets.id),
  commission:  numeric("commission", { precision: 18, scale: 2 }).notNull(),
  created_at:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("referral_earnings_referral_id_idx").on(t.referral_id),
  index("referral_earnings_bet_id_idx").on(t.bet_id),
  index("referral_earnings_created_idx").on(t.created_at),
]);

export const admin_audit_log = pgTable("admin_audit_log", {
  id:          uuid("id").primaryKey().defaultRandom(),
  admin_id:    uuid("admin_id").notNull().references(() => profiles.id),
  action:      text("action").notNull(),
  target_type: text("target_type").notNull(),
  target_id:   uuid("target_id").notNull(),
  details:     jsonb("details"),
  ip_address:  text("ip_address"),
  created_at:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("admin_audit_log_admin_id_idx").on(t.admin_id),
  index("admin_audit_log_action_idx").on(t.action),
  index("admin_audit_log_created_idx").on(t.created_at),
]);
