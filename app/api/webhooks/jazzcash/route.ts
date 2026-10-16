import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deposits, payment_accounts } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { verifyJazzCashIPN, type JazzCashCredentials } from "@/lib/gateways/jazzcash";
import { creditWallet } from "@/lib/actions/wallet";

/**
 * JazzCash IPN (Instant Payment Notification)
 * JazzCash POSTs form-urlencoded data to this URL on payment completion.
 * Register this URL in your JazzCash merchant portal:
 *   https://yourdomain.com/api/webhooks/jazzcash
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const params = Object.fromEntries(new URLSearchParams(body));

    // pp_BillReference contains our depositId (set during initiation)
    const depositId = params.pp_BillReference;
    const responseCode = params.pp_ResponseCode;
    const externalRef = params.pp_TxnRefNo;

    if (!depositId) return NextResponse.json({ error: "Missing bill reference" }, { status: 400 });

    // Load deposit + payment account to get integrity salt for HMAC verification
    const [deposit] = await db
      .select()
      .from(deposits)
      .where(eq(deposits.id, depositId))
      .limit(1);

    if (!deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    if (deposit.status === "confirmed") return NextResponse.json({ ok: true }); // idempotent

    const [account] = await db
      .select()
      .from(payment_accounts)
      .where(eq(payment_accounts.id, deposit.payment_account_id))
      .limit(1);

    const creds = account?.credentials as unknown as JazzCashCredentials;

    // Verify HMAC signature
    if (!verifyJazzCashIPN(params, creds.integrity_salt)) {
      console.warn("[jazzcash webhook] HMAC mismatch");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // "000" = success
    if (responseCode !== "000") {
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
        `JazzCash deposit ${externalRef}`
      );
      await tx.update(deposits).set({
        status: "confirmed",
        gateway_ref: externalRef,
        confirmed_at: new Date(),
      }).where(eq(deposits.id, depositId));
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[jazzcash webhook]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
