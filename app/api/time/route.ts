import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Authoritative clock for the shared skyrise round sequence. Device clocks drift
// by seconds, which on a ~20 s round is enough to put two phones visibly out of
// phase; clients sync against this once on mount and apply the offset locally.
// Public and deliberately trivial — it discloses nothing beyond the time.
export async function GET() {
  return NextResponse.json(
    { now: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
