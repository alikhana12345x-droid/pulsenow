import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { game_rounds } from "@/lib/supabase/schema";
import { slugMatches } from "@/lib/peek";

export const dynamic = "force-dynamic";

// A skyrise row is inserted ~1 s before the plane launches (BETS_LOCK_SECONDS)
// and flipped to "completed" when the client settles it. If the player closes
// the tab mid-flight settle never runs and the row stays "pending" forever —
// so anything older than this window is abandoned, not upcoming.
const PENDING_FRESH_MS = 25_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS = {
  id: game_rounds.id,
  multiplier: game_rounds.multiplier,
  status: game_rounds.status,
  created_at: game_rounds.created_at,
  completed_at: game_rounds.completed_at,
  is_promo: game_rounds.is_promo,
  is_win_round: game_rounds.is_win_round,
  effective_win_probability: game_rounds.effective_win_probability,
  outcome: game_rounds.outcome,
};

type Row = {
  id: string;
  multiplier: string | null;
  status: string;
  created_at: Date;
  completed_at: Date | null;
  is_promo: boolean;
  is_win_round: boolean | null;
  effective_win_probability: string | null;
  outcome: unknown;
};

function shape(row: Row) {
  const outcome = (row.outcome ?? {}) as { userId?: string };
  return {
    id: row.id,
    // A round still "pending" past the freshness window was abandoned — the
    // player closed the tab mid-flight so settle never ran. The viewer needs
    // this to stop counting a flight that ended long ago.
    stale:
      row.status === "pending" &&
      Date.now() - row.created_at.getTime() > PENDING_FRESH_MS,
    // `multiplier` is written as crashAt.toFixed(4) at placement, so it needs no
    // digging into the outcome JSON.
    crashAt: row.multiplier == null ? null : Number(row.multiplier),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    isPromo: row.is_promo,
    isWinRound: row.is_win_round,
    effectiveWinPct:
      row.effective_win_probability == null ? null : Number(row.effective_win_probability),
    // Short prefix only — enough to tell two concurrent players apart on screen
    // without putting a full account id on an unlisted page.
    player: outcome.userId ? outcome.userId.slice(0, 8) : null,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  // Wrong or unconfigured slug is indistinguishable from a route that does not
  // exist — no 403, which would confirm the path is real.
  if (!slugMatches(slug)) return new NextResponse(null, { status: 404 });

  const watchId = req.nextUrl.searchParams.get("watch");

  try {
    const [pendingRows, watchedRows] = await Promise.all([
      db
        .select(COLUMNS)
        .from(game_rounds)
        .where(
          and(
            eq(game_rounds.game_type, "skyrise"),
            eq(game_rounds.status, "pending"),
            gt(game_rounds.created_at, new Date(Date.now() - PENDING_FRESH_MS)),
          ),
        )
        .orderBy(desc(game_rounds.created_at))
        .limit(1),
      watchId && UUID_RE.test(watchId)
        ? db.select(COLUMNS).from(game_rounds).where(eq(game_rounds.id, watchId)).limit(1)
        : Promise.resolve([]),
    ]);

    return NextResponse.json(
      {
        now: Date.now(),
        pending: pendingRows[0] ? shape(pendingRows[0] as Row) : null,
        watched: watchedRows[0] ? shape(watchedRows[0] as Row) : null,
        // Distinguishes "you asked about a round that no longer exists" from
        // "you didn't ask about one" — the viewer must drop a vanished round
        // instead of showing its last known value forever.
        watchedMissing: Boolean(watchId) && watchedRows.length === 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[peek/feed]", err);
    return NextResponse.json({ error: "Feed unavailable" }, { status: 500 });
  }
}
