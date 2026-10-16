"use server";

import { db } from "@/lib/db";
import { house_payouts, deposits, withdrawals, admin_audit_log } from "@/lib/supabase/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { verifyCapability } from "@/lib/auth/permissions";
import { getSolidPayAccount, type PaymentAccountCredentials } from "@/lib/actions/payment-accounts";
import {
  payOut,
  isSolidPayConfigured,
  solidPayNotifyUrl,
  normalizePkMobile,
  toOrderNo,
} from "@/lib/gateways/solidpay";
import { resolveAcctCode, isBankCode, bankName } from "@/lib/gateways/solidpay-banks";
import { settleHousePayoutFailure } from "@/lib/finance/settlement";
import { reconcileSolidPayHousePayout } from "@/lib/finance/solidpay-reconcile";
import { MIN_WITHDRAWAL } from "@/lib/finance-limits";

/**
 * Profit collection: moving the house's own money out of the payment gateway
 * to a company JazzCash / Easypaisa / bank account.
 *
 * This is the single most dangerous action in the admin panel — it sends real
 * money to an operator-supplied account with no player and no wallet behind
 * it. Hence: superadmin-only, every attempt written to the audit log, a
 * duplicate guard on rapid identical requests, and the same rule the player
 * payout path follows — an unclear provider response is NEVER treated as a
 * failure, because a retry could pay twice.
 */

/** SolidPay's own per-order floor; below this the provider rejects outright. */
const MIN_HOUSE_PAYOUT = MIN_WITHDRAWAL;

/** A second identical request inside this window is treated as a double-submit. */
const DUPLICATE_WINDOW_MS = 5 * 60_000;

export interface HousePayoutInput {
  amount: number;
  /** "jazzcash" | "easypaisa" | a numeric SolidPay bank code */
  method: string;
  acctNo: string;
  acctName: string;
  /** Required by SolidPay for bank transfers (03xx). */
  mobile?: string;
  note?: string;
}

export async function createHousePayout(input: HousePayoutInput) {
  const admin = await verifyCapability("withdraw_house_funds");

  const amount = Number(input.amount);
  const acctNo = String(input.acctNo ?? "").trim();
  const acctName = String(input.acctName ?? "").trim();
  const note = String(input.note ?? "").trim() || null;

  if (!Number.isFinite(amount) || amount < MIN_HOUSE_PAYOUT) {
    throw new Error(`Minimum payout is PKR ${MIN_HOUSE_PAYOUT.toLocaleString("en-PK")}.`);
  }
  if (!acctNo) throw new Error("Enter the destination account number.");
  if (!acctName) throw new Error("Enter the account holder's name.");

  const acctCode = resolveAcctCode(input.method);
  if (!acctCode) throw new Error("Pick a valid destination method.");

  const bank = isBankCode(acctCode);
  const mobile = String(input.mobile ?? "").trim();
  if (bank && !mobile) {
    throw new Error("Bank transfers need a mobile number (03xx).");
  }

  if (!isSolidPayConfigured()) {
    throw new Error("SolidPay is not configured — set SOLID_PAY_API_KEY and SOLID_PAY_MERCHANT_NO.");
  }

  // Double-submit guard. A repeat of the same amount to the same account while
  // the first is still in flight is far more likely a double click than a
  // deliberate second transfer.
  const [recent] = await db
    .select({ id: house_payouts.id })
    .from(house_payouts)
    .where(
      and(
        eq(house_payouts.status, "processing"),
        eq(house_payouts.acct_no, acctNo),
        eq(house_payouts.amount, String(amount.toFixed(2))),
        gte(house_payouts.created_at, new Date(Date.now() - DUPLICATE_WINDOW_MS))
      )
    )
    .limit(1);

  if (recent) {
    throw new Error(
      "An identical payout to this account is already in progress. Wait for it to settle before sending another."
    );
  }

  const [payout] = await db
    .insert(house_payouts)
    .values({
      amount: String(amount.toFixed(2)),
      currency: "PKR",
      method: input.method,
      acct_code: acctCode,
      acct_no: acctNo,
      acct_name: acctName,
      mobile: bank ? normalizePkMobile(mobile) : null,
      status: "processing",
      requested_by: admin.id,
      note,
      metadata: { provider: "solidpay", bank_name: bank ? bankName(acctCode) : null },
    })
    .returning();

  // Logged before dispatch: if the provider call hangs, the attempt is still
  // on record with who made it.
  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "house_payout_requested",
    target_type: "house_payout",
    target_id: payout.id,
    details: { amount: payout.amount, method: input.method, acct_no: acctNo, acct_name: acctName, note },
  });

  const orderNo = toOrderNo(payout.id);
  const result = await payOut({
    orderNo,
    amount,
    currency: "PKR",
    acctName,
    acctCode,
    acctNo: bank ? acctNo : normalizePkMobile(acctNo),
    mobile: bank ? normalizePkMobile(mobile) : null,
    notifyUrl: solidPayNotifyUrl("payout"),
  });

  if (result.outcome === "failed") {
    // A well-formed rejection is the only case where nothing was sent.
    await settleHousePayoutFailure(payout.id, result.msg || "Rejected by provider", {
      meta: { dispatch: "rejected" },
    });
    revalidatePath("/admin/payouts");
    return { id: payout.id, status: "failed" as const, message: result.msg };
  }

  await db
    .update(house_payouts)
    .set({
      gateway_ref: orderNo,
      metadata: {
        provider: "solidpay",
        bank_name: bank ? bankName(acctCode) : null,
        dispatch: result.outcome === "ok" ? "accepted" : "unknown",
        dispatch_msg: result.msg,
      },
    })
    .where(eq(house_payouts.id, payout.id));

  if (result.outcome === "unknown") {
    console.warn(`[house-payout] unclear response for ${orderNo}: ${result.msg}`);
  }

  revalidatePath("/admin/payouts");
  return {
    id: payout.id,
    status: "processing" as const,
    message:
      result.outcome === "unknown"
        ? "Sent, but the provider's reply was unclear. It is being tracked — do not resend; use Sync to check."
        : result.msg,
  };
}

export async function getHousePayouts(limit = 25) {
  await verifyCapability("withdraw_house_funds");
  return db.select().from(house_payouts).orderBy(desc(house_payouts.created_at)).limit(limit);
}

export async function syncHousePayout(payoutId: string) {
  await verifyCapability("withdraw_house_funds");
  const result = await reconcileSolidPayHousePayout(payoutId);
  if (result.changed) revalidatePath("/admin/payouts");
  return result;
}

/**
 * What the gateway should be holding, derived from our own settled records:
 * confirmed gateway deposits, less player payouts, less profit already taken.
 *
 * The provider takes a commission on both legs — a PKR 1,000 deposit lands as
 * roughly 970 — so the percentages configured on the SolidPay account are
 * applied here. It is still an estimate; SolidPay's Money Detail page is the
 * authority.
 */
export async function getHouseFloatEstimate() {
  await verifyCapability("withdraw_house_funds");

  const account =
    (await getSolidPayAccount("deposit")) ?? (await getSolidPayAccount("withdrawal"));
  const creds = (account?.credentials ?? {}) as PaymentAccountCredentials;
  const payInFeePct = Number(creds.payin_fee_pct ?? 0) || 0;
  const payOutFeePct = Number(creds.payout_fee_pct ?? 0) || 0;

  const [depositRow] = await db
    .select({ total: sql<string>`coalesce(sum(${deposits.amount}), 0)` })
    .from(deposits)
    .where(
      and(
        eq(deposits.status, "confirmed"),
        sql`${deposits.metadata}->>'provider' = 'solidpay'`
      )
    );

  const [withdrawalRow] = await db
    .select({ total: sql<string>`coalesce(sum(${withdrawals.amount}), 0)` })
    .from(withdrawals)
    .where(
      and(
        eq(withdrawals.status, "completed"),
        sql`${withdrawals.metadata}->>'provider' = 'solidpay'`,
        // A failed SolidPay payout an admin then paid by hand never left the gateway.
        sql`coalesce(${withdrawals.metadata}->>'paid_manually', 'false') <> 'true'`
      )
    );

  // Anything still in flight is money already committed, so it counts against
  // what is safe to take out.
  const [houseRow] = await db
    .select({ total: sql<string>`coalesce(sum(${house_payouts.amount}), 0)` })
    .from(house_payouts)
    .where(sql`${house_payouts.status} IN ('completed', 'processing')`);

  const grossCollected = Number(depositRow?.total ?? 0);
  const paidToPlayers = Number(withdrawalRow?.total ?? 0);
  const takenByHouse = Number(houseRow?.total ?? 0);

  // Deposits arrive net of commission; payouts cost the amount plus commission.
  const collected = grossCollected * (1 - payInFeePct / 100);
  const paidOut = (paidToPlayers + takenByHouse) * (1 + payOutFeePct / 100);

  return {
    grossCollected,
    collected,
    paidToPlayers,
    takenByHouse,
    payInFeePct,
    payOutFeePct,
    feesConfigured: payInFeePct > 0 || payOutFeePct > 0,
    available: collected - paidOut,
  };
}

/**
 * The outbound IP this server currently uses to reach SolidPay — the value
 * their support needs for a payout whitelist. On serverless hosting it is the
 * IP of *this* invocation and can differ between requests, which is exactly
 * what makes whitelisting fragile; see the note on the Payouts page.
 */
export async function getEgressIp(): Promise<{ ip: string | null; error: string | null }> {
  await verifyCapability("withdraw_house_funds");

  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { ip: null, error: `Lookup failed (HTTP ${res.status})` };
    const data = (await res.json()) as { ip?: string };
    return { ip: data.ip ?? null, error: data.ip ? null : "Lookup returned no address" };
  } catch (err) {
    return { ip: null, error: err instanceof Error ? err.message : "Lookup failed" };
  }
}
