import {
  pgTable, uuid, text, boolean, integer, numeric, jsonb, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";

import { profiles, wallets } from "./profile";

export const transactions = pgTable("transactions", {
  id:             uuid("id").primaryKey().defaultRandom(),
  wallet_id:      uuid("wallet_id").notNull().references(() => wallets.id),
  type:           text("type").notNull(),
  amount:         numeric("amount", { precision: 18, scale: 2 }).notNull(),
  balance_before: numeric("balance_before", { precision: 18, scale: 2 }).notNull(),
  balance_after:  numeric("balance_after", { precision: 18, scale: 2 }).notNull(),
  reference_type: text("reference_type"),
  reference_id:   uuid("reference_id"),
  description:    text("description"),
  metadata:       jsonb("metadata"),
  created_at:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("transactions_wallet_created_idx").on(t.wallet_id, t.created_at),
  index("transactions_reference_idx").on(t.reference_type, t.reference_id),
]);

export const payment_accounts = pgTable("payment_accounts", {
  id:              uuid("id").primaryKey().defaultRandom(),
  gateway:         text("gateway").notNull(),
  label:           text("label").notNull(),
  credentials:     jsonb("credentials").notNull(),
  is_active:       boolean("is_active").notNull().default(true),
  is_deposit:      boolean("is_deposit").notNull().default(true),
  is_withdrawal:   boolean("is_withdrawal").notNull().default(true),
  daily_limit:     numeric("daily_limit", { precision: 18, scale: 2 }).notNull(),
  daily_used:      numeric("daily_used", { precision: 18, scale: 2 }).notNull().default("0.00"),
  priority:        integer("priority").notNull().default(0),
  metadata:        jsonb("metadata"),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payment_accounts_gateway_active_idx").on(t.gateway, t.is_active),
  index("payment_accounts_is_active_idx").on(t.is_active),
]);

export const deposits = pgTable("deposits", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  user_id:            uuid("user_id").notNull().references(() => profiles.id),
  wallet_id:          uuid("wallet_id").notNull().references(() => wallets.id),
  payment_account_id: uuid("payment_account_id").notNull().references(() => payment_accounts.id),
  amount:             numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency:           text("currency").notNull(),
  status:             text("status").notNull().default("pending"),
  gateway_ref:        text("gateway_ref"),
  proof_url:          text("proof_url"),
  confirmed_by:       uuid("confirmed_by").references(() => profiles.id),
  metadata:           jsonb("metadata"),
  created_at:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmed_at:       timestamp("confirmed_at", { withTimezone: true }),
}, (t) => [
  index("deposits_user_status_idx").on(t.user_id, t.status),
  index("deposits_created_idx").on(t.created_at),
  index("deposits_status_created_idx").on(t.status, t.created_at),
]);

/**
 * The house's own withdrawals from the payment gateway — profit collection,
 * not a player payout. Deliberately a separate table from `withdrawals`: there
 * is no player, no wallet and no balance to deduct, and mixing these into the
 * player ledger would corrupt every finance report and cash reconciliation.
 */
export const house_payouts = pgTable("house_payouts", {
  id:               uuid("id").primaryKey().defaultRandom(),
  amount:           numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency:         text("currency").notNull().default("PKR"),
  /** "jazzcash" | "easypaisa" | "bank_<code>" — what the operator picked. */
  method:           text("method").notNull(),
  /** What was sent as SolidPay's acctCode: JAZZCASH / EASYPAISA / bank code. */
  acct_code:        text("acct_code").notNull(),
  acct_no:          text("acct_no").notNull(),
  acct_name:        text("acct_name").notNull(),
  mobile:           text("mobile"),
  status:           text("status").notNull().default("processing"),
  gateway_ref:      text("gateway_ref"),
  failure_reason:   text("failure_reason"),
  requested_by:     uuid("requested_by").notNull().references(() => profiles.id),
  note:             text("note"),
  metadata:         jsonb("metadata"),
  created_at:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processed_at:     timestamp("processed_at", { withTimezone: true }),
}, (t) => [
  index("house_payouts_status_created_idx").on(t.status, t.created_at),
  index("house_payouts_created_idx").on(t.created_at),
]);

export const withdrawals = pgTable("withdrawals", {
  id:               uuid("id").primaryKey().defaultRandom(),
  user_id:          uuid("user_id").notNull().references(() => profiles.id),
  wallet_id:        uuid("wallet_id").notNull().references(() => wallets.id),
  amount:           numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency:         text("currency").notNull(),
  method:           text("method").notNull(),
  destination:      text("destination").notNull(),
  status:           text("status").notNull().default("pending"),
  reviewed_by:      uuid("reviewed_by").references(() => profiles.id),
  rejection_reason: text("rejection_reason"),
  gateway_ref:      text("gateway_ref"),
  metadata:         jsonb("metadata"),
  created_at:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processed_at:     timestamp("processed_at", { withTimezone: true }),
}, (t) => [
  index("withdrawals_user_id_idx").on(t.user_id),
  index("withdrawals_status_created_idx").on(t.status, t.created_at),
  index("withdrawals_created_idx").on(t.created_at),
]);
