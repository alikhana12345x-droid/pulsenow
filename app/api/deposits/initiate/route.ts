import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { deposits } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import {
  getActiveDepositAccounts,
  getManualDepositAccount,
  getPaymentAccountById,
  getSolidPayAccount,
  type PaymentAccountCredentials,
} from "@/lib/actions/payment-accounts";
import { getPaymentMode } from "@/lib/actions/platform-settings";
import { getOrCreateWallet } from "@/lib/actions/wallet";
import { newTxnRef } from "@/lib/gateways/jazzcash";
import {
  payIn,
  isSolidPayConfigured,
  solidPayNotifyUrl,
  normalizePkMobile,
  toOrderNo,
  resolveChannel,
  channelNeedsAccount,
  SOLIDPAY_GATEWAYS,
  SOLIDPAY_GATEWAY_ID,
} from "@/lib/gateways/solidpay";
import { MIN_DEPOSIT, MAX_DEPOSIT, fmtPkr } from "@/lib/finance-limits";
import { notifyDeposit } from "@/lib/notifications/discord";

const SANDBOX = process.env.NEXT_PUBLIC_SANDBOX_MODE === "true";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    if (!auth?.claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = auth.claims.sub as string;
    const { gateway, accountId, phone, amount, currency = "PKR", proof, senderRef } = await req.json();

    if (!gateway || !amount || amount > MAX_DEPOSIT) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (amount < MIN_DEPOSIT) {
      return NextResponse.json(
        { error: `Minimum deposit is PKR ${fmtPkr(MIN_DEPOSIT)}.` },
        { status: 400 }
      );
    }
    // The aggregator is a routing config, never a method a player can pick.
    if (gateway === SOLIDPAY_GATEWAY_ID) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

    const mode = await getPaymentMode();

    // ── MANUAL: player pays into the admin's account and uploads a screenshot.
    //    The deposit stays "pending" until an admin verifies the proof and
    //    approves it (adminForceCompleteDeposit credits the wallet).
    if (mode === "manual") {
      if (typeof proof !== "string" || !proof.startsWith("data:image/")) {
        return NextResponse.json({ error: "Please attach a payment screenshot." }, { status: 400 });
      }
      if (proof.length > 3_000_000) {
        return NextResponse.json({ error: "Screenshot is too large. Please retake or crop it." }, { status: 413 });
      }

      // Honor the specific account the player picked; fall back to the
      // highest-priority account for the gateway. Always re-validate server-side.
      const picked =
        typeof accountId === "string" && accountId
          ? await getPaymentAccountById(accountId)
          : null;
      const account =
        picked && picked.is_active && picked.is_deposit
          ? picked
          : await getManualDepositAccount(gateway);
      if (!account) {
        return NextResponse.json({ error: "No payment account available for this method. Try another." }, { status: 503 });
      }

      const wallet = await getOrCreateWallet(userId, currency);

      const [deposit] = await db.insert(deposits).values({
        user_id: userId,
        wallet_id: wallet.id,
        payment_account_id: account.id,
        amount: String(amount),
        currency,
        status: "pending",
        proof_url: proof,
        metadata: {
          manual: true,
          sender_ref: typeof senderRef === "string" ? senderRef.trim() || null : null,
        },
      }).returning();

      notifyDeposit(deposit.id, "deposit_requested");
      return NextResponse.json({ status: "pending", depositId: deposit.id, manual: true });
    }

    // ── AUTO ────────────────────────────────────────────────────────────────
    const isCrypto = gateway.startsWith("crypto");
    const wallet = await getOrCreateWallet(userId, currency);

    // Crypto keeps its own rails: the player sends on-chain and a Tatum
    // subscription credits the wallet on confirmation.
    if (isCrypto) {
      const accounts = await getActiveDepositAccounts(gateway, amount);
      if (!accounts.length) {
        return NextResponse.json({ error: "No payment accounts available for this method. Try another." }, { status: 503 });
      }
      const account = accounts[0];
      const creds = account.credentials as Record<string, string>;

      if (SANDBOX) return sandboxConfirm(userId, wallet.id, account.id, amount, currency);

      const txnRef = newTxnRef();
      const [deposit] = await db.insert(deposits).values({
        user_id: userId,
        wallet_id: wallet.id,
        payment_account_id: account.id,
        amount: String(amount),
        currency,
        status: "pending",
        gateway_ref: txnRef,
      }).returning();

      notifyDeposit(deposit.id, "deposit_requested");
      return NextResponse.json({
        sandbox: false,
        status: "pending",
        depositId: deposit.id,
        txnRef,
        cryptoAddress: creds.wallet_address,
        network: creds.network,
        message: `Send ${currency} to the address shown. We'll credit automatically after confirmation.`,
      });
    }

    // Fiat in auto mode routes through SolidPay.
    if (!SOLIDPAY_GATEWAYS.includes(gateway)) {
      return NextResponse.json({ error: "This payment method is not available right now." }, { status: 400 });
    }

    const account = await getSolidPayAccount("deposit");
    if (!account) {
      return NextResponse.json(
        { error: "Online payments are not set up yet. Please try again later." },
        { status: 503 }
      );
    }
    if (!isSolidPayConfigured()) {
      console.error("[deposits/initiate] SolidPay account is active but SOLID_PAY_API_KEY / SOLID_PAY_MERCHANT_NO are missing");
      return NextResponse.json(
        { error: "Online payments are temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    if (SANDBOX) return sandboxConfirm(userId, wallet.id, account.id, amount, currency);

    const creds = (account.credentials ?? {}) as PaymentAccountCredentials;
    const channel = resolveChannel(gateway, creds);

    // Hosted checkout asks for the wallet number on its own page — only the
    // direct channels need it from us.
    if (channelNeedsAccount(channel) && !phone) {
      return NextResponse.json({ error: "Enter your mobile wallet number." }, { status: 400 });
    }
    const payAccount = channelNeedsAccount(channel) ? normalizePkMobile(String(phone)) : null;

    const [deposit] = await db.insert(deposits).values({
      user_id: userId,
      wallet_id: wallet.id,
      payment_account_id: account.id,
      amount: String(amount),
      currency,
      status: "pending",
      metadata: { provider: "solidpay", gateway, channel },
    }).returning();

    const orderNo = toOrderNo(deposit.id);
    const result = await payIn({
      orderNo,
      amount: Number(amount),
      currency,
      channel,
      merchNo: creds.merch_no,
      payAccount,
      notifyUrl: solidPayNotifyUrl("payin"),
    });

    if (result.outcome === "failed") {
      await db
        .update(deposits)
        .set({ status: "failed", metadata: { provider: "solidpay", gateway, channel, failure_reason: result.msg } })
        .where(eq(deposits.id, deposit.id));

      notifyDeposit(deposit.id, "deposit_failed", { reason: result.msg || "Rejected by payment provider" });
      console.warn(`[deposits/initiate] SolidPay rejected ${orderNo}: ${result.msg}`);
      return NextResponse.json(
        { error: "The payment provider declined this request. Please try again or pick another method." },
        { status: 502 }
      );
    }

    if (result.outcome === "unknown") {
      // A timeout or unreadable reply does NOT mean the order failed — the
      // deposit stays pending and the status poll reconciles it against
      // SolidPay before it is ever written off.
      await db
        .update(deposits)
        .set({
          gateway_ref: orderNo,
          metadata: { provider: "solidpay", gateway, channel, dispatch: "unknown", dispatch_msg: result.msg },
        })
        .where(eq(deposits.id, deposit.id));

      notifyDeposit(deposit.id, "deposit_requested");
      console.warn(`[deposits/initiate] SolidPay unclear response for ${orderNo}: ${result.msg}`);
      return NextResponse.json(
        {
          status: "pending",
          depositId: deposit.id,
          error: "We couldn't reach the payment provider. If money leaves your account it will be credited automatically — otherwise please try again in a moment.",
        },
        { status: 502 }
      );
    }

    const redirectUrl = result.data.code_url?.trim() || null;

    await db
      .update(deposits)
      .set({
        gateway_ref: orderNo,
        metadata: { provider: "solidpay", gateway, channel, code_url: redirectUrl },
      })
      .where(eq(deposits.id, deposit.id));

    notifyDeposit(deposit.id, "deposit_requested");

    return NextResponse.json({
      sandbox: false,
      status: "pending",
      depositId: deposit.id,
      txnRef: orderNo,
      redirectUrl,
      message: redirectUrl
        ? "Complete the payment on the page that opens. This screen updates automatically."
        : "Approve the payment on your phone. This page will update automatically.",
    });
  } catch (err: unknown) {
    console.error("[deposits/initiate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payment initiation failed" },
      { status: 500 }
    );
  }
}

/** Sandbox: skip the provider entirely and credit the wallet immediately. */
async function sandboxConfirm(
  userId: string,
  walletId: string,
  accountId: string,
  amount: number,
  currency: string
) {
  const { confirmDeposit } = await import("@/lib/actions/deposits");
  const [deposit] = await db.insert(deposits).values({
    user_id: userId,
    wallet_id: walletId,
    payment_account_id: accountId,
    amount: String(amount),
    currency,
    status: "pending",
    gateway_ref: `SANDBOX_${Date.now()}`,
  }).returning();

  await confirmDeposit(deposit.id, null);

  return NextResponse.json({ sandbox: true, status: "confirmed", depositId: deposit.id });
}
