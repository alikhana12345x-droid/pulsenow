"use server";

import { db } from "@/lib/db";
import { payment_accounts } from "@/lib/supabase/schema";
import { eq, and, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { SOLIDPAY_GATEWAY_ID } from "@/lib/gateways/solidpay";
import { verifyCapability } from "@/lib/auth/permissions";

/**
 * Rows here hold live gateway secrets (merchant ids, hash keys, webhook
 * secrets) and decide where player money lands, so every admin-facing read and
 * every mutation is superadmin-only.
 *
 * The player-facing readers below (`getActiveDepositMethods`,
 * `getActiveWithdrawalMethods`, `getActiveCryptoDepositGateways`) stay open on
 * purpose — they project a secret-free view for the checkout screens.
 */
const verifyAccountAccess = () => verifyCapability("manage_payment_accounts");

export type GatewayType = "jazzcash" | "easypaisa" | "crypto_usdt" | "crypto_eth" | "solidpay";

export interface PaymentAccountCredentials {
  account_number?: string;
  account_title?: string;
  wallet_address?: string;
  network?: string;
  // Manual-flow display fields (shown to players on the deposit checkout).
  logo?: string;        // base64 data URL
  instructions?: string;
  // Auto-flow gateway secrets (never exposed to the client).
  merchant_id?: string;
  password?: string;
  integrity_salt?: string;
  store_id?: string;
  hash_key?: string;
  webhook_secret?: string;
  sandbox?: boolean;
  // SolidPay routing config. The API key itself stays in env and is never
  // written to the database.
  merch_no?: string;
  jazzcash_channel?: string;
  easypaisa_channel?: string;
  /** Provider commission, %. Used to estimate the real gateway balance. */
  payin_fee_pct?: number;
  payout_fee_pct?: number;
  [key: string]: unknown;
}

/** Display-only view of a deposit account — safe to send to the browser (no secrets). */
export interface DepositMethod {
  id: string;
  gateway: string;
  label: string;
  account_title: string | null;
  account_number: string | null;
  wallet_address: string | null;
  network: string | null;
  logo: string | null;
  instructions: string | null;
}

export async function getPaymentAccounts() {
  await verifyAccountAccess();
  return db.select().from(payment_accounts).orderBy(payment_accounts.priority);
}

export async function getPaymentAccountById(id: string) {
  const [account] = await db.select().from(payment_accounts).where(eq(payment_accounts.id, id)).limit(1);
  return account ?? null;
}

export async function getActiveDepositAccounts(gateway: GatewayType, amount: number) {
  return db
    .select()
    .from(payment_accounts)
    .where(
      and(
        eq(payment_accounts.gateway, gateway),
        eq(payment_accounts.is_active, true),
        eq(payment_accounts.is_deposit, true),
        sql`(${payment_accounts.daily_limit} - ${payment_accounts.daily_used}) >= ${amount}`
      )
    )
    .orderBy(sql`${payment_accounts.priority} DESC, ${payment_accounts.daily_used} ASC`)
    .limit(1);
}

/**
 * Auto flow: the SolidPay routing row. Deposits still need a payment_account_id
 * (the column is NOT NULL), and this row is also where the admin keeps the
 * merchant number and per-gateway channel choice.
 *
 * Unlike deposit rotation this deliberately ignores daily_limit — an aggregator
 * has no per-account capacity to protect, and a stale daily_used would take the
 * whole auto flow offline.
 */
export async function getSolidPayAccount(side: "deposit" | "withdrawal") {
  const [account] = await db
    .select()
    .from(payment_accounts)
    .where(
      and(
        eq(payment_accounts.gateway, SOLIDPAY_GATEWAY_ID),
        eq(payment_accounts.is_active, true),
        side === "deposit"
          ? eq(payment_accounts.is_deposit, true)
          : eq(payment_accounts.is_withdrawal, true)
      )
    )
    .orderBy(sql`${payment_accounts.priority} DESC`)
    .limit(1);
  return account ?? null;
}

/**
 * Manual flow: pick the account players should pay into for a given method.
 * Highest priority wins; the daily-limit filter used by auto-rotation is
 * intentionally skipped (there's no automatic capacity to protect here).
 */
export async function getManualDepositAccount(gateway: string) {
  const [account] = await db
    .select()
    .from(payment_accounts)
    .where(
      and(
        eq(payment_accounts.gateway, gateway),
        eq(payment_accounts.is_active, true),
        eq(payment_accounts.is_deposit, true)
      )
    )
    .orderBy(sql`${payment_accounts.priority} DESC, ${payment_accounts.daily_used} ASC`)
    .limit(1);
  return account ?? null;
}

/**
 * Display-only deposit methods for the player-facing checkout. Whitelists the
 * fields shown to users and NEVER returns gateway secrets. Ordered so the
 * highest-priority account per gateway comes first (matches what
 * getManualDepositAccount picks at submit time).
 */
export async function getActiveDepositMethods(): Promise<DepositMethod[]> {
  const rows = await db
    .select({
      id: payment_accounts.id,
      gateway: payment_accounts.gateway,
      label: payment_accounts.label,
      credentials: payment_accounts.credentials,
    })
    .from(payment_accounts)
    .where(
      and(
        eq(payment_accounts.is_active, true),
        eq(payment_accounts.is_deposit, true),
        ne(payment_accounts.gateway, SOLIDPAY_GATEWAY_ID)
      )
    )
    .orderBy(sql`${payment_accounts.priority} DESC, ${payment_accounts.daily_used} ASC`);

  return rows.map((r) => {
    const c = (r.credentials ?? {}) as PaymentAccountCredentials;
    return {
      id: r.id,
      gateway: r.gateway,
      label: r.label,
      account_title: c.account_title ?? null,
      account_number: c.account_number ?? null,
      wallet_address: c.wallet_address ?? null,
      network: c.network ?? null,
      logo: c.logo ?? null,
      instructions: c.instructions ?? null,
    };
  });
}

/**
 * Withdrawal method types the platform can pay out to (manual flow). Deduped by
 * gateway — the player enters their own destination, so we only need the set of
 * available methods, not specific admin accounts. Never returns secrets.
 */
export async function getActiveWithdrawalMethods(): Promise<{ gateway: string; logo: string | null }[]> {
  const rows = await db
    .select({ gateway: payment_accounts.gateway, credentials: payment_accounts.credentials })
    .from(payment_accounts)
    .where(
      and(
        eq(payment_accounts.is_active, true),
        eq(payment_accounts.is_withdrawal, true),
        ne(payment_accounts.gateway, SOLIDPAY_GATEWAY_ID)
      )
    )
    .orderBy(sql`${payment_accounts.priority} DESC`);

  const seen = new Map<string, { gateway: string; logo: string | null }>();
  for (const r of rows) {
    if (seen.has(r.gateway)) continue;
    const c = (r.credentials ?? {}) as PaymentAccountCredentials;
    seen.set(r.gateway, { gateway: r.gateway, logo: c.logo ?? null });
  }
  return Array.from(seen.values());
}

/**
 * Auto flow: crypto gateways still run on their own rails (wallet address +
 * chain monitoring), so they stay offered alongside the aggregator's methods.
 */
export async function getActiveCryptoDepositGateways(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ gateway: payment_accounts.gateway })
    .from(payment_accounts)
    .where(
      and(
        eq(payment_accounts.is_active, true),
        eq(payment_accounts.is_deposit, true),
        sql`${payment_accounts.gateway} LIKE 'crypto%'`
      )
    );
  return rows.map((r) => r.gateway);
}

export async function createPaymentAccount(data: {
  gateway: GatewayType;
  label: string;
  credentials: PaymentAccountCredentials;
  daily_limit: number;
  priority: number;
  is_deposit: boolean;
  is_withdrawal: boolean;
}) {
  await verifyAccountAccess();
  await db.insert(payment_accounts).values({
    gateway: data.gateway,
    label: data.label,
    credentials: data.credentials,
    daily_limit: String(data.daily_limit),
    priority: data.priority,
    is_deposit: data.is_deposit,
    is_withdrawal: data.is_withdrawal,
    is_active: true,
    daily_used: "0",
  });
  revalidatePath("/admin/payment-accounts");
}

export async function updatePaymentAccount(
  id: string,
  data: {
    label?: string;
    credentials?: PaymentAccountCredentials;
    daily_limit?: number;
    priority?: number;
    is_active?: boolean;
    is_deposit?: boolean;
    is_withdrawal?: boolean;
  }
) {
  await verifyAccountAccess();
  const updateData: Record<string, unknown> = { ...data };
  if (data.daily_limit !== undefined) updateData.daily_limit = String(data.daily_limit);
  await db.update(payment_accounts).set(updateData).where(eq(payment_accounts.id, id));
  revalidatePath("/admin/payment-accounts");
}

export async function togglePaymentAccount(id: string, isActive: boolean) {
  await verifyAccountAccess();
  await db
    .update(payment_accounts)
    .set({ is_active: isActive })
    .where(eq(payment_accounts.id, id));
  revalidatePath("/admin/payment-accounts");
}

export async function resetDailyUsed(id: string) {
  await verifyAccountAccess();
  await db
    .update(payment_accounts)
    .set({ daily_used: "0" })
    .where(eq(payment_accounts.id, id));
  revalidatePath("/admin/payment-accounts");
}

export async function deletePaymentAccount(id: string) {
  await verifyAccountAccess();
  await db.delete(payment_accounts).where(eq(payment_accounts.id, id));
  revalidatePath("/admin/payment-accounts");
}
