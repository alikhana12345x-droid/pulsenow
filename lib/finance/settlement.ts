import { db } from "@/lib/db";
import { deposits, withdrawals, wallets, transactions, house_payouts } from "@/lib/supabase/schema";
import { eq, sql } from "drizzle-orm";
import { creditWallet } from "@/lib/actions/wallet";
import { notifyDeposit, notifyWithdrawal } from "@/lib/notifications/discord";

/**
 * Idempotent settlement of deposits and withdrawals.
 *
 * Both an async gateway callback and the client's status poll can race to
 * settle the same order, and a gateway may deliver the same notification more
 * than once. Every function here locks the row first and no-ops unless the row
 * is still in a settleable state, so a repeat can never double-credit.
 *
 * Discord is notified only on a "settled" result, so a repeated callback can't
 * post the same event twice either.
 */

export type SettleResult = "settled" | "already" | "not_found";

type Json = Record<string, unknown>;

const mergeMeta = (existing: unknown, patch: Json): Json => ({
  ...((existing ?? {}) as Json),
  ...patch,
});

/** Merge a patch into a row's jsonb metadata without clobbering what's there. */
const metaPatch = (patch: Json) =>
  sql`coalesce(metadata, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`;

export async function touchDepositMeta(depositId: string, patch: Json) {
  await db.update(deposits).set({ metadata: metaPatch(patch) }).where(eq(deposits.id, depositId));
}

export async function touchWithdrawalMeta(withdrawalId: string, patch: Json) {
  await db.update(withdrawals).set({ metadata: metaPatch(patch) }).where(eq(withdrawals.id, withdrawalId));
}

// ── Deposits ─────────────────────────────────────────────────────────────────

export async function settleDepositSuccess(
  depositId: string,
  opts: { gatewayRef?: string | null; description?: string; meta?: Json } = {}
): Promise<SettleResult> {
  const result = await db.transaction(async (tx): Promise<SettleResult> => {
    const [deposit] = await tx
      .select()
      .from(deposits)
      .where(eq(deposits.id, depositId))
      .for("update");

    if (!deposit) return "not_found";
    if (deposit.status !== "pending") return "already";

    await creditWallet(
      tx,
      deposit.wallet_id,
      Number(deposit.amount),
      "deposit",
      "deposit",
      deposit.id,
      opts.description ?? `Deposit ${deposit.gateway_ref ?? deposit.id} confirmed`
    );

    await tx
      .update(deposits)
      .set({
        status: "confirmed",
        gateway_ref: opts.gatewayRef ?? deposit.gateway_ref,
        confirmed_at: new Date(),
        metadata: mergeMeta(deposit.metadata, { ...opts.meta, settled_at: new Date().toISOString() }),
      })
      .where(eq(deposits.id, deposit.id));

    return "settled";
  });
  if (result === "settled") notifyDeposit(depositId, "deposit_confirmed");
  return result;
}

export async function settleDepositFailure(
  depositId: string,
  reason: string,
  opts: { status?: "failed" | "cancelled"; meta?: Json } = {}
): Promise<SettleResult> {
  const result = await db.transaction(async (tx): Promise<SettleResult> => {
    const [deposit] = await tx
      .select()
      .from(deposits)
      .where(eq(deposits.id, depositId))
      .for("update");

    if (!deposit) return "not_found";

    // A confirmed deposit that the provider later reverses is a chargeback: the
    // balance may already be staked, so it is flagged for an admin rather than
    // silently clawed back.
    if (deposit.status !== "pending") {
      await tx
        .update(deposits)
        .set({ metadata: mergeMeta(deposit.metadata, { reversal_notice: reason, reversal_at: new Date().toISOString() }) })
        .where(eq(deposits.id, deposit.id));
      return "already";
    }

    await tx
      .update(deposits)
      .set({
        status: opts.status ?? "failed",
        metadata: mergeMeta(deposit.metadata, { ...opts.meta, failure_reason: reason }),
      })
      .where(eq(deposits.id, deposit.id));

    return "settled";
  });
  if (result === "settled") notifyDeposit(depositId, "deposit_failed", { reason });
  return result;
}

// ── Withdrawals ──────────────────────────────────────────────────────────────

/** Statuses a withdrawal can still be settled from — see withdrawals/initiate. */
const OPEN_WITHDRAWAL = ["pending", "processing"];

/**
 * Marks a withdrawal paid — by a gateway confirmation, or by an admin who sent
 * the money by hand (`reviewedBy` set). The status guard inside the lock means
 * two admins, or an admin and a late callback, can't both complete it.
 */
export async function settleWithdrawalSuccess(
  withdrawalId: string,
  opts: { gatewayRef?: string | null; meta?: Json; reviewedBy?: string; actor?: string } = {}
): Promise<SettleResult> {
  const result = await db.transaction(async (tx): Promise<SettleResult> => {
    const [withdrawal] = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .for("update");

    if (!withdrawal) return "not_found";
    if (!OPEN_WITHDRAWAL.includes(withdrawal.status)) return "already";

    await tx
      .update(withdrawals)
      .set({
        status: "completed",
        gateway_ref: opts.gatewayRef ?? withdrawal.gateway_ref,
        reviewed_by: opts.reviewedBy ?? withdrawal.reviewed_by,
        processed_at: new Date(),
        metadata: mergeMeta(withdrawal.metadata, { ...opts.meta, settled_at: new Date().toISOString() }),
      })
      .where(eq(withdrawals.id, withdrawal.id));

    return "settled";
  });
  if (result === "settled") notifyWithdrawal(withdrawalId, "withdrawal_completed", { actor: opts.actor });
  return result;
}

/**
 * The gateway couldn't pay a withdrawal out (or it was never sent to one). The
 * balance stays deducted and the withdrawal waits on the Finance desk as
 * "pending", for an admin to pay by hand (Complete) or refund (Reject).
 *
 * Deliberately never refunds on its own. Third-party payouts aren't fully
 * reliable, and an automatic refund next to a manual payment — or next to a
 * late success from the provider — would pay the player twice.
 */
export async function holdWithdrawalForManualPayout(
  withdrawalId: string,
  reason: string,
  opts: { meta?: Json } = {}
): Promise<SettleResult> {
  const result = await db.transaction(async (tx): Promise<SettleResult> => {
    const [withdrawal] = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .for("update");

    if (!withdrawal) return "not_found";
    if (!OPEN_WITHDRAWAL.includes(withdrawal.status)) return "already";

    // Already waiting on an admin — a repeated callback or poll changes nothing.
    const meta = (withdrawal.metadata ?? {}) as Json;
    if (withdrawal.status === "pending" && meta.dispatch === "manual_review") return "already";

    await tx
      .update(withdrawals)
      .set({
        status: "pending",
        metadata: mergeMeta(withdrawal.metadata, {
          ...opts.meta,
          dispatch: "manual_review",
          manual_reason: reason,
          manual_since: new Date().toISOString(),
        }),
      })
      .where(eq(withdrawals.id, withdrawal.id));

    return "settled";
  });
  if (result === "settled") {
    notifyWithdrawal(withdrawalId, "withdrawal_failed", {
      reason: `${reason} — balance kept. Pay it manually from Finance, or reject it to refund.`,
    });
  }
  return result;
}

/**
 * An admin turned a withdrawal down: return the money to the player and take it
 * back off their lifetime withdrawn total. Runs at most once per withdrawal,
 * hence the status guard inside the lock.
 */
export async function refundWithdrawal(
  withdrawalId: string,
  reason: string,
  opts: { reviewedBy?: string; actor?: string; meta?: Json } = {}
): Promise<SettleResult> {
  const result = await db.transaction(async (tx): Promise<SettleResult> => {
    const [withdrawal] = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .for("update");

    if (!withdrawal) return "not_found";
    if (!OPEN_WITHDRAWAL.includes(withdrawal.status)) return "already";

    const amount = Number(withdrawal.amount);

    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.id, withdrawal.wallet_id))
      .for("update");

    if (!wallet) return "not_found";

    const before = Number(wallet.balance);
    const after = before + amount;

    await tx
      .update(wallets)
      .set({
        balance: String(after),
        total_withdrawn: String(Math.max(0, Number(wallet.total_withdrawn) - amount)),
        updated_at: new Date(),
      })
      .where(eq(wallets.id, wallet.id));

    await tx.insert(transactions).values({
      wallet_id: wallet.id,
      type: "withdrawal_refund",
      amount: String(amount),
      balance_before: String(before),
      balance_after: String(after),
      reference_type: "withdrawal",
      reference_id: withdrawal.id,
      description: `Withdrawal rejected — ${reason}`,
    });

    await tx
      .update(withdrawals)
      .set({
        status: "rejected",
        rejection_reason: reason,
        reviewed_by: opts.reviewedBy ?? withdrawal.reviewed_by,
        processed_at: new Date(),
        metadata: mergeMeta(withdrawal.metadata, { ...opts.meta, refunded_at: new Date().toISOString() }),
      })
      .where(eq(withdrawals.id, withdrawal.id));

    return "settled";
  });
  if (result === "settled") notifyWithdrawal(withdrawalId, "withdrawal_failed", { reason, actor: opts.actor });
  return result;
}

// ── House payouts ────────────────────────────────────────────────────────────
// Profit collection out of the gateway. No wallet and no player balance is
// involved, so settling is only a status transition — but it still has to be
// idempotent, since the callback and the sync button can both land on it.

export async function settleHousePayoutSuccess(
  payoutId: string,
  opts: { gatewayRef?: string | null; meta?: Json } = {}
): Promise<SettleResult> {
  return db.transaction(async (tx) => {
    const [payout] = await tx
      .select()
      .from(house_payouts)
      .where(eq(house_payouts.id, payoutId))
      .for("update");

    if (!payout) return "not_found";
    if (payout.status !== "processing") return "already";

    await tx
      .update(house_payouts)
      .set({
        status: "completed",
        gateway_ref: opts.gatewayRef ?? payout.gateway_ref,
        processed_at: new Date(),
        metadata: mergeMeta(payout.metadata, { ...opts.meta, settled_at: new Date().toISOString() }),
      })
      .where(eq(house_payouts.id, payout.id));

    return "settled";
  });
}

export async function settleHousePayoutFailure(
  payoutId: string,
  reason: string,
  opts: { meta?: Json } = {}
): Promise<SettleResult> {
  return db.transaction(async (tx) => {
    const [payout] = await tx
      .select()
      .from(house_payouts)
      .where(eq(house_payouts.id, payoutId))
      .for("update");

    if (!payout) return "not_found";
    if (payout.status !== "processing") return "already";

    await tx
      .update(house_payouts)
      .set({
        status: "failed",
        failure_reason: reason,
        processed_at: new Date(),
        metadata: mergeMeta(payout.metadata, { ...opts.meta, failed_at: new Date().toISOString() }),
      })
      .where(eq(house_payouts.id, payout.id));

    return "settled";
  });
}
