import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { withdrawals, wallets, transactions, profiles } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { getOrCreateWallet } from "@/lib/actions/wallet";
import { getPaymentMode } from "@/lib/actions/platform-settings";
import { getSolidPayAccount, type PaymentAccountCredentials } from "@/lib/actions/payment-accounts";
import {
  payOut,
  isSolidPayConfigured,
  solidPayNotifyUrl,
  normalizePkMobile,
  toOrderNo,
} from "@/lib/gateways/solidpay";
import { resolveAcctCode, isBankCode } from "@/lib/gateways/solidpay-banks";
import { holdWithdrawalForManualPayout, touchWithdrawalMeta } from "@/lib/finance/settlement";
import { notifyWithdrawal } from "@/lib/notifications/discord";
import {
  MIN_WITHDRAWAL,
  MAX_WITHDRAWAL,
  WITHDRAW_MIN_TOTAL_DEPOSIT,
  fmtPkr,
} from "@/lib/finance-limits";

const SANDBOX = process.env.NEXT_PUBLIC_SANDBOX_MODE === "true";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    if (!auth?.claims) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.claims.sub as string;
    const body = await req.json();
    const { method, amount, destination, currency = "PKR", accountName, mobile } = body;

    if (!method || !amount || !destination) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount < MIN_WITHDRAWAL) {
      return NextResponse.json(
        { error: `Minimum withdrawal is PKR ${fmtPkr(MIN_WITHDRAWAL)}.` },
        { status: 400 }
      );
    }
    if (numAmount > MAX_WITHDRAWAL) {
      return NextResponse.json(
        { error: `Maximum withdrawal is PKR ${fmtPkr(MAX_WITHDRAWAL)}.` },
        { status: 400 }
      );
    }

    const mode = await getPaymentMode();
    const payeeName = typeof accountName === "string" ? accountName.trim() : "";

    // Everything the provider needs is validated *before* any money moves —
    // a rejected payout after the debit would mean an avoidable refund.
    const autoDispatch = mode === "auto" && !SANDBOX;
    let acctCode: string | null = null;

    if (autoDispatch) {
      acctCode = resolveAcctCode(method);
      if (!acctCode) {
        return NextResponse.json(
          { error: "This withdrawal method isn't available right now. Please pick another." },
          { status: 400 }
        );
      }
      if (!payeeName) {
        return NextResponse.json(
          { error: "Enter the account holder's name exactly as it appears on the account." },
          { status: 400 }
        );
      }
      if (isBankCode(acctCode) && !mobile) {
        return NextResponse.json(
          { error: "A mobile number is required for bank transfers." },
          { status: 400 }
        );
      }
    }

    const wallet = await getOrCreateWallet(userId, currency);

    // Withdrawals unlock only once lifetime deposits clear the threshold.
    // Enforced here as well as in the UI — the sheet's disabled state is
    // cosmetic and a crafted request would otherwise slip through.
    const totalDeposited = Number(wallet.total_deposited);
    if (totalDeposited < WITHDRAW_MIN_TOTAL_DEPOSIT) {
      return NextResponse.json(
        {
          error: `Withdrawals unlock after you have deposited PKR ${fmtPkr(WITHDRAW_MIN_TOTAL_DEPOSIT)} in total. You have deposited PKR ${fmtPkr(totalDeposited)} so far.`,
        },
        { status: 400 }
      );
    }

    if (Number(wallet.balance) < numAmount) {
      return NextResponse.json({ error: "Insufficient balance." }, { status: 400 });
    }

    if (wallet.is_locked) {
      return NextResponse.json(
        { error: "A withdrawal is already in progress on this account. Please wait for it to complete." },
        { status: 400 }
      );
    }

    // An admin hold changes only where the request goes — the player gets the
    // same checks and the same response; the desk decides whether it's paid.
    const [profile] = await db
      .select({ withdrawals_held: profiles.withdrawals_held })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    const held = profile?.withdrawals_held ?? false;

    // What a request in this mode normally answers with once it's recorded.
    const openStatus = mode === "manual" ? "pending" : "processing";

    // Step 1: Deduct balance + record transaction atomically.
    // Withdrawal starts as "processing" until the gateway call confirms.
    const [withdrawal] = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.id, wallet.id))
        .for("update");

      if (!locked) throw new Error("Wallet not found");

      const before = Number(locked.balance);
      const after = before - numAmount;

      if (after < 0) throw new Error("Insufficient balance");

      await tx
        .update(wallets)
        .set({
          balance: String(after),
          total_withdrawn: String(Number(locked.total_withdrawn) + numAmount),
          updated_at: new Date(),
        })
        .where(eq(wallets.id, wallet.id));

      await tx.insert(transactions).values({
        wallet_id: wallet.id,
        type: "withdrawal",
        amount: String(numAmount),
        balance_before: String(before),
        balance_after: String(after),
        reference_type: "withdrawal",
        description: `Withdrawal via ${method} to ${destination}`,
      });

      return tx
        .insert(withdrawals)
        .values({
          user_id: userId,
          wallet_id: wallet.id,
          amount: String(numAmount),
          currency,
          method,
          destination,
          // Manual payouts, and every payout of a held player, wait for an
          // admin; auto payouts go to the gateway next.
          status: mode === "manual" || held ? "pending" : "processing",
          metadata: {
            acct_name: payeeName || null,
            acct_code: acctCode,
            ...(held && {
              hold: true,
              dispatch: "manual_review",
              manual_reason: "Withdrawals are on hold for this player",
              manual_since: new Date().toISOString(),
            }),
          },
        })
        .returning();
    });

    if (!SANDBOX) {
      notifyWithdrawal(
        withdrawal.id,
        "withdrawal_requested",
        held ? { reason: "Withdrawals are on hold for this player — not sent to the gateway. Pay it or reject it from Finance." } : {}
      );
    }

    // From here the balance is deducted and the request is on record, so the
    // player always gets the normal "being processed" answer — never an error
    // that would invite a second request. Anything that goes wrong is left on
    // the Finance desk for an admin to pay by hand; nothing is auto-refunded.
    const accepted = NextResponse.json({ status: openStatus, withdrawalId: withdrawal.id });

    // MANUAL (or HELD): the request sits "pending" until an admin sends the
    // money and marks it complete, or rejects it (→ refund).
    if (mode === "manual" || held) return accepted;

    // Step 2: Sandbox — skip the gateway call, mark done immediately.
    if (SANDBOX) {
      await db
        .update(withdrawals)
        .set({ status: "completed", processed_at: new Date() })
        .where(eq(withdrawals.id, withdrawal.id));

      return NextResponse.json({ status: "completed", withdrawalId: withdrawal.id });
    }

    // Step 3: Production — dispatch through SolidPay. Until payOut is called
    // nothing has left, so a problem up to that point is safe to hand to the
    // desk; once it has been called, the money may be on its way.
    let dispatched = false;
    try {
      const account = await getSolidPayAccount("withdrawal");
      if (!account || !isSolidPayConfigured()) {
        console.error("[withdrawals/initiate] auto mode without a usable SolidPay route");
        await holdWithdrawalForManualPayout(withdrawal.id, "SolidPay is not configured");
        return accepted;
      }

      const creds = (account.credentials ?? {}) as PaymentAccountCredentials;
      const bank = isBankCode(acctCode!);
      const orderNo = toOrderNo(withdrawal.id);

      dispatched = true;
      const result = await payOut({
        orderNo,
        amount: numAmount,
        currency,
        acctName: payeeName,
        acctCode: acctCode!,
        acctNo: bank ? String(destination).trim() : normalizePkMobile(String(destination)),
        mobile: bank ? normalizePkMobile(String(mobile)) : null,
        merchNo: creds.merch_no,
        notifyUrl: solidPayNotifyUrl("payout"),
      });

      if (result.outcome === "failed") {
        // A well-formed rejection means nothing was sent. The provider's
        // reason is kept for the desk; the player just sees it processing.
        console.warn(`[withdrawals/initiate] SolidPay rejected ${orderNo}: ${result.msg}`);
        await holdWithdrawalForManualPayout(withdrawal.id, result.msg || "Payout rejected by provider", {
          meta: { provider: "solidpay", dispatch_msg: result.msg },
        });
        return accepted;
      }

      // A timeout or unreadable reply is NOT a failure — the payout may well be
      // on its way. It stays "processing" and is resolved by the payout callback
      // or the status poll's query. Paying it by hand here risks paying twice.
      await db
        .update(withdrawals)
        .set({
          gateway_ref: orderNo,
          metadata: {
            acct_name: payeeName,
            acct_code: acctCode,
            provider: "solidpay",
            dispatch: result.outcome === "ok" ? "accepted" : "unknown",
            dispatch_msg: result.msg,
          },
        })
        .where(eq(withdrawals.id, withdrawal.id));

      if (result.outcome === "unknown") {
        console.warn(`[withdrawals/initiate] SolidPay unclear response for ${orderNo}: ${result.msg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[withdrawals/initiate] dispatch error", err);
      if (dispatched) {
        // Same as an unclear reply: left for the callback or the poll to settle.
        await touchWithdrawalMeta(withdrawal.id, { provider: "solidpay", dispatch: "unknown", dispatch_msg: msg });
      } else {
        await holdWithdrawalForManualPayout(withdrawal.id, `Payout could not be started: ${msg}`);
      }
    }

    return accepted;

  } catch (err: unknown) {
    console.error("[withdrawals/initiate]", err);
    return NextResponse.json(
      { error: "Our payment service is temporarily unavailable. Please try again in a few minutes." },
      { status: 500 }
    );
  }
}
