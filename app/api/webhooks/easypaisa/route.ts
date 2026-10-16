import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deposits, payment_accounts } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { verifyEasypaisaWebhook, type EasypaisaCredentials } from "@/lib/gateways/easypaisa";
import { creditWallet } from "@/lib/actions/wallet";

/**
 * Easypaisa payment callback.
 * Register: https://yourdomain.com/api/webhooks/easypaisa
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json() as Record<string, string>;

    // orderId = depositId set during initiation
    const depositId = payload.orderId;
    const responseCode = payload.responseCode;
    const txnId = payload.transactionId;

    if (!depositId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const [deposit] = await db
      .select()
      .from(deposits)
      .where(eq(deposits.id, depositId))
      .limit(1);

    if (!deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    if (deposit.status === "confirmed") return NextResponse.json({ ok: true });

    const [account] = await db
      .select()
      .from(payment_accounts)
      .where(eq(payment_accounts.id, deposit.payment_account_id))
      .limit(1);

    const creds = account?.credentials as unknown as EasypaisaCredentials;

    if (!verifyEasypaisaWebhook(payload, creds.hash_key)) {
      console.warn("[easypaisa webhook] hash mismatch");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // "0000" = success
    if (responseCode !== "0000") {
      await db.update(deposits).set({ status: "failed" }).where(eq(deposits.id, depositId));
      return NextResponse.json({ ok: true });
    }

    await db.transaction(async (tx) => {
      await creditWallet(
        tx,
        deposit.wallet_id,
        Number(deposit.amount),
        "deposit",
        "deposit",
        deposit.id,
        `Easypaisa deposit ${txnId}`
      );
      await tx.update(deposits).set({
        status: "confirmed",
        gateway_ref: txnId,
        confirmed_at: new Date(),
      }).where(eq(deposits.id, depositId));
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[easypaisa webhook]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
