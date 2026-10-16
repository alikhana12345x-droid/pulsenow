import { db } from "@/lib/db";
import { deposits, withdrawals, payment_accounts, house_payouts } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import type { PaymentAccountCredentials } from "@/lib/actions/payment-accounts";
import {
  payInQuery,
  payOutQuery,
  classifyOrderState,
  isOrderNotFound,
  isSolidPayConfigured,
  toOrderNo,
} from "@/lib/gateways/solidpay";
import {
  settleDepositSuccess,
  settleDepositFailure,
  settleWithdrawalSuccess,
  holdWithdrawalForManualPayout,
  settleHousePayoutSuccess,
  settleHousePayoutFailure,
} from "./settlement";

/**
 * Ask SolidPay what actually happened to an order and settle from the answer.
 *
 * Used by the player-facing status polls and by the admin "Sync" buttons, so
 * both paths reach the same verdict. Settlement itself is idempotent, so
 * racing with an incoming callback is safe.
 */

export type ReconcileOutcome = {
  /** Status after reconciling — unchanged when nothing could be decided. */
  status: string;
  reason: string | null;
  changed: boolean;
};

/** How long a deposit may sit pending before an unanswered order is written off. */
const DEFAULT_EXPIRE_AFTER_MS = 30 * 60_000;

const unchanged = (status: string, reason: string | null = null): ReconcileOutcome => ({
  status,
  reason,
  changed: false,
});

export async function reconcileSolidPayDeposit(
  depositId: string,
  opts: { expireAfterMs?: number } = {}
): Promise<ReconcileOutcome> {
  const [row] = await db
    .select({
      id: deposits.id,
      status: deposits.status,
      gateway_ref: deposits.gateway_ref,
      metadata: deposits.metadata,
      created_at: deposits.created_at,
      credentials: payment_accounts.credentials,
    })
    .from(deposits)
    .leftJoin(payment_accounts, eq(payment_accounts.id, deposits.payment_account_id))
    .where(eq(deposits.id, depositId))
    .limit(1);

  if (!row) return unchanged("not_found");
  if (row.status !== "pending") return unchanged(row.status);

  const meta = (row.metadata ?? {}) as { provider?: string };
  if (meta.provider !== "solidpay") return unchanged(row.status, "Not a SolidPay order");
  if (!isSolidPayConfigured()) return unchanged(row.status, "SolidPay is not configured");

  const creds = (row.credentials ?? {}) as PaymentAccountCredentials;
  const orderNo = row.gateway_ref ?? toOrderNo(row.id);

  try {
    const result = await payInQuery(orderNo, creds.merch_no);

    if (result.outcome === "ok") {
      const outcome = classifyOrderState(result.data.orderState);
      const settleMeta = {
        provider: "solidpay",
        order_state: String(result.data.orderState ?? ""),
        reconciled: true,
      };

      if (outcome === "success") {
        await settleDepositSuccess(row.id, {
          gatewayRef: result.data.businessNo ?? orderNo,
          description: `SolidPay deposit ${result.data.businessNo ?? orderNo}`,
          meta: settleMeta,
        });
        return { status: "confirmed", reason: null, changed: true };
      }

      if (outcome === "failed" || outcome === "reversed") {
        const reason = String(result.data.msg ?? "").trim() || "Payment was not completed";
        await settleDepositFailure(row.id, reason, { meta: settleMeta });
        return { status: "failed", reason, changed: true };
      }
    }

    // "OrderNo not exist" is the only reply that proves nothing was created,
    // and even that is only acted on after the window — an order can take a
    // moment to register on their side.
    const age = Date.now() - new Date(row.created_at).getTime();
    const expired = age > (opts.expireAfterMs ?? DEFAULT_EXPIRE_AFTER_MS);

    if (expired && (isOrderNotFound(result) || result.outcome !== "failed")) {
      const reason = "Payment was not completed in time";
      await settleDepositFailure(row.id, reason);
      return { status: "failed", reason, changed: true };
    }

    return unchanged(row.status, result.outcome === "ok" ? "Still awaiting payment" : result.msg);
  } catch (err) {
    console.error("[solidpay] deposit reconcile failed", err);
    return unchanged(row.status, "Could not reach the payment provider");
  }
}

export async function reconcileSolidPayWithdrawal(withdrawalId: string): Promise<ReconcileOutcome> {
  const [row] = await db
    .select({
      id: withdrawals.id,
      status: withdrawals.status,
      gateway_ref: withdrawals.gateway_ref,
      metadata: withdrawals.metadata,
    })
    .from(withdrawals)
    .where(eq(withdrawals.id, withdrawalId))
    .limit(1);

  if (!row) return unchanged("not_found");
  if (!["processing", "pending"].includes(row.status)) return unchanged(row.status);

  const meta = (row.metadata ?? {}) as { provider?: string };
  if (meta.provider !== "solidpay") return unchanged(row.status, "Not a SolidPay payout");
  if (!isSolidPayConfigured()) return unchanged(row.status, "SolidPay is not configured");

  const orderNo = row.gateway_ref ?? toOrderNo(row.id);

  try {
    const result = await payOutQuery(orderNo);
    if (result.outcome !== "ok") return unchanged(row.status, result.msg);

    const outcome = classifyOrderState(result.data.orderState);
    const settleMeta = {
      provider: "solidpay",
      order_state: String(result.data.orderState ?? ""),
      reconciled: true,
    };

    if (outcome === "success") {
      await settleWithdrawalSuccess(row.id, {
        gatewayRef: result.data.businessNo ?? orderNo,
        meta: settleMeta,
      });
      return { status: "completed", reason: null, changed: true };
    }

    if (outcome === "failed" || outcome === "reversed") {
      // Not refunded — it goes to the Finance desk to be paid by hand. The
      // provider's text is for admins, so it isn't passed back to the player.
      const reason = String(result.data.msg ?? "").trim() || "Payout could not be completed";
      const held = await holdWithdrawalForManualPayout(row.id, reason, { meta: settleMeta });
      return { status: "pending", reason: null, changed: held === "settled" };
    }

    return unchanged(row.status, "Payout still in progress");
  } catch (err) {
    console.error("[solidpay] withdrawal reconcile failed", err);
    return unchanged(row.status, "Could not reach the payment provider");
  }
}

/**
 * Same query, same verdict rules, applied to a house profit withdrawal. Kept
 * separate from the player path because there is no wallet to refund — a
 * failed house payout simply means the money stayed at the gateway.
 */
export async function reconcileSolidPayHousePayout(payoutId: string): Promise<ReconcileOutcome> {
  const [row] = await db
    .select({
      id: house_payouts.id,
      status: house_payouts.status,
      gateway_ref: house_payouts.gateway_ref,
    })
    .from(house_payouts)
    .where(eq(house_payouts.id, payoutId))
    .limit(1);

  if (!row) return unchanged("not_found");
  if (row.status !== "processing") return unchanged(row.status);
  if (!isSolidPayConfigured()) return unchanged(row.status, "SolidPay is not configured");

  const orderNo = row.gateway_ref ?? toOrderNo(row.id);

  try {
    const result = await payOutQuery(orderNo);
    if (result.outcome !== "ok") return unchanged(row.status, result.msg);

    const outcome = classifyOrderState(result.data.orderState);
    const settleMeta = {
      provider: "solidpay",
      order_state: String(result.data.orderState ?? ""),
      reconciled: true,
    };

    if (outcome === "success") {
      await settleHousePayoutSuccess(row.id, {
        gatewayRef: result.data.businessNo ?? orderNo,
        meta: settleMeta,
      });
      return { status: "completed", reason: null, changed: true };
    }

    if (outcome === "failed" || outcome === "reversed") {
      const reason = String(result.data.msg ?? "").trim() || "Payout could not be completed";
      await settleHousePayoutFailure(row.id, reason, { meta: settleMeta });
      return { status: "failed", reason, changed: true };
    }

    return unchanged(row.status, "Payout still in progress");
  } catch (err) {
    console.error("[solidpay] house payout reconcile failed", err);
    return unchanged(row.status, "Could not reach the payment provider");
  }
}
