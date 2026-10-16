import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateWallet } from "@/lib/actions/wallet";
import { WITHDRAW_MIN_TOTAL_DEPOSIT } from "@/lib/finance-limits";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub as string | undefined;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wallet = await getOrCreateWallet(userId);

    const totalDeposited = Number(wallet.total_deposited);

    return NextResponse.json({
      balance:  Number(wallet.balance),
      currency: wallet.currency,
      isLocked: wallet.is_locked,
      // Withdrawals stay locked until lifetime deposits clear the threshold.
      totalDeposited,
      withdrawUnlockAt:      WITHDRAW_MIN_TOTAL_DEPOSIT,
      canWithdraw:           totalDeposited >= WITHDRAW_MIN_TOTAL_DEPOSIT,
      depositsNeededToUnlock: Math.max(0, WITHDRAW_MIN_TOTAL_DEPOSIT - totalDeposited),
    });
  } catch (err: unknown) {
    console.error("[wallet/summary]", err);
    return NextResponse.json({ error: "Failed to load wallet" }, { status: 500 });
  }
}
