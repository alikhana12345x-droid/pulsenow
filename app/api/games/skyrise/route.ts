import { NextRequest, NextResponse } from "next/server";
import { startSkyRiseRound } from "@/lib/actions/games";

// XOR-encode crashAt with the roundId so the plain multiplier is not visible
// in DevTools network tab. The client decodes with the same key.
function encodeCrashAt(crashAt: number, roundId: string): string {
  const src = crashAt.toFixed(4);
  const key = roundId.replace(/-/g, "");
  return src
    .split("")
    .map((c, i) => (c.charCodeAt(0) ^ parseInt(key[i % key.length], 16)).toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roundId, crashAt, newBalance } = await startSkyRiseRound(body);
    return NextResponse.json({
      roundId,
      newBalance,
      crashAt: encodeCrashAt(crashAt, roundId),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
