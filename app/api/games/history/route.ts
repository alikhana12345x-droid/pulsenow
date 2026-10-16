import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { bets, game_rounds } from "@/lib/supabase/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const game = req.nextUrl.searchParams.get("game");

  const conditions = [eq(bets.user_id, userId)];
  if (game) conditions.push(eq(game_rounds.game_type, game));

  const results = await db
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
    .where(and(...conditions))
    .orderBy(desc(bets.created_at))
    .limit(30);

  return NextResponse.json(results);
}
