import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { bets, game_rounds, transactions, wallets } from "@/lib/supabase/schema";
import { eq, desc } from "drizzle-orm";
import { getUserDeposits } from "@/lib/actions/deposits";
import { getUserWithdrawals } from "@/lib/actions/withdrawals";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.user_id, userId))
    .limit(1);

  if (!wallet) {
    return NextResponse.json({
      transactions: [],
      bets: [],
      deposits: [],
      withdrawals: [],
      wallet: null,
    });
  }

  const [txRes, betRes, depositRes, withdrawalRes] = await Promise.allSettled([
    db
      .select()
      .from(transactions)
      .where(eq(transactions.wallet_id, wallet.id))
      .orderBy(desc(transactions.created_at))
      .limit(50),
    db
      .select({
        id: bets.id,
        amount: bets.amount,
        payout: bets.payout,
        profit: bets.profit,
        choice: bets.choice,
        created_at: bets.created_at,
        outcome: game_rounds.outcome,
        multiplier: game_rounds.multiplier,
        game_type: game_rounds.game_type,
      })
      .from(bets)
      .innerJoin(game_rounds, eq(bets.round_id, game_rounds.id))
      .where(eq(bets.user_id, userId))
      .orderBy(desc(bets.created_at))
      .limit(50),
    getUserDeposits(userId),
    getUserWithdrawals(userId),
  ]);

  return NextResponse.json({
    transactions: txRes.status      === "fulfilled" ? txRes.value      : [],
    bets:         betRes.status     === "fulfilled" ? betRes.value     : [],
    deposits:     depositRes.status === "fulfilled" ? depositRes.value : [],
    withdrawals:  withdrawalRes.status === "fulfilled" ? withdrawalRes.value : [],
    wallet: {
      balance: Number(wallet.balance),
      total_deposited: Number(wallet.total_deposited),
      total_withdrawn: Number(wallet.total_withdrawn),
      total_won: Number(wallet.total_won),
      total_wagered: Number(wallet.total_wagered),
      currency: wallet.currency,
      is_locked: wallet.is_locked,
    },
  });
}
