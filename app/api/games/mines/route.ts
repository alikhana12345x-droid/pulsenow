import { NextRequest, NextResponse } from "next/server";
import { startMinesRound } from "@/lib/actions/games";

// XOR-encode mineSet array so it is not readable as plain JSON in DevTools.
// The client decodes it using the same roundId-derived key.
function encodeMineSet(mineSet: number[], roundId: string): string {
  const src = JSON.stringify(mineSet);
  const key = roundId.replace(/-/g, "");
  return src
    .split("")
    .map((c, i) => (c.charCodeAt(0) ^ parseInt(key[i % key.length], 16)).toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roundId, mineSet, seedHash, newBalance, isWinRound } = await startMinesRound(body);
    return NextResponse.json({
      roundId,
      seedHash,
      newBalance,
      // Both win AND loss rounds receive an encoded mineSet so the network tab
      // looks identical — no asymmetric request patterns to detect.
      // WIN:  real mine positions  → client plays normally with instant local reveals
      // LOSS: sentinel [-1]        → client detects loss, shows mine on first click
      //                              with ZERO additional API calls
      mineSet: encodeMineSet(isWinRound ? mineSet : [-1], roundId),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
