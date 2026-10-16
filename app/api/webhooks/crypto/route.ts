import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deposits, payment_accounts } from "@/lib/supabase/schema";
import { eq, and } from "drizzle-orm";
import { verifyCryptoWebhook, type CryptoCredentials } from "@/lib/gateways/crypto";
import { creditWallet } from "@/lib/actions/wallet";

/**
 * Blockchain monitoring webhook (Tatum.io / Moralis / custom).
 * Tatum sends x-payload-hash header (HMAC-SHA512 of raw body).
 * Register: https://yourdomain.com/api/webhooks/crypto
 *
 * Tatum.io setup:
 *   POST https://api.tatum.io/v3/subscription
 *   { type: "ADDRESS_TRANSACTION", attr: { address, chain, url } }
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-payload-hash") ?? "";

    const payload = JSON.parse(rawBody) as {
      address: string;           // receiving wallet address
      asset: string;             // token symbol
      amount: string;
      txId: string;
      blockNumber: number;
    };

    // Find the payment account for this address
    const allAccounts = await db.select().from(payment_accounts);
    const account = allAccounts.find((a) => {
      const c = a.credentials as Record<string, string>;
      return c.wallet_address?.toLowerCase() === payload.address?.toLowerCase();
    });

    if (!account) return NextResponse.json({ error: "Unknown address" }, { status: 404 });

    const creds = account.credentials as unknown as CryptoCredentials;

    if (creds.webhook_secret) {
      if (!verifyCryptoWebhook(rawBody, signature, creds.webhook_secret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const receivedAmount = Number(payload.amount);

    // Find the matching pending deposit by payment_account and approximate amount
    const [deposit] = await db
      .select()
      .from(deposits)
      .where(
        and(
          eq(deposits.payment_account_id, account.id),
          eq(deposits.status, "pending")
        )
      )
      .orderBy(deposits.created_at)
      .limit(1);

    if (!deposit) {
      console.warn("[crypto webhook] No pending deposit for address", payload.address);
      return NextResponse.json({ ok: true });
    }

    if (deposit.status === "confirmed") return NextResponse.json({ ok: true });

    await db.transaction(async (tx) => {
      await creditWallet(
        tx,
        deposit.wallet_id,
        Number(deposit.amount),
        "deposit",
        "deposit",
        deposit.id,
        `${payload.asset} deposit ${payload.txId}`
      );
      await tx.update(deposits).set({
        status: "confirmed",
        gateway_ref: payload.txId,
        confirmed_at: new Date(),
      }).where(eq(deposits.id, deposit.id));
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[crypto webhook]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
