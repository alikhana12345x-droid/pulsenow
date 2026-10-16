import { NextRequest, NextResponse } from "next/server";
import { startHiLoRound, drawHiLoCard } from "@/lib/actions/games";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amount, direction, currentRank } = body;
    // x-user-sub is set by the proxy middleware (JWT already verified) —
    // passing it directly avoids a redundant Supabase auth call per request.
    const userId = req.headers.get("x-user-sub") ?? undefined;

    const { roundId, newBalance } = await startHiLoRound({ amount, userId });

    if (direction && typeof currentRank === "number") {
      const { nextCard, win, settled } = await drawHiLoCard({ roundId, currentRank, direction, userId });
      return NextResponse.json({ roundId, newBalance, nextCard, win, settled });
    }

    return NextResponse.json({ roundId, newBalance });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
