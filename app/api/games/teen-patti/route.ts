import { NextRequest, NextResponse } from "next/server";
import { playTeenPattiRound } from "@/lib/actions/games";

// Warm-up ping. The game fetches this on mount so the first real round's POST
// doesn't pay the route's cold-start/compile cost inside the bets-lock window
// (which would surface as a "Dealing…" hold on the very first bet).
export async function GET() {
  return NextResponse.json({ ok: true });
}

// One-shot round settlement: the client posts its zone stakes when bets lock and
// gets back the fully-settled outcome to animate. Amounts, hands, and payout are
// all server-decided — nothing here is client-trusted.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await playTeenPattiRound({ bets: body?.bets });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
