import "server-only";

import { db } from "@/lib/db";
import { games } from "@/lib/supabase/schema";
import { asc } from "drizzle-orm";
import {
  type GameStatus,
  type RegistryGame,
  catalogueFallbackGames,
  coerceGameStatus,
  isGameSlug,
} from "@/lib/games-catalogue";

// In-memory cache (mirrors the bet-amount-tiers cache). Games change rarely
// (admin-only), so the lobby read and the per-bet enforcement lookup pay zero DB
// round-trips on a hit. Admin mutations call invalidateGamesCache() immediately.
const CACHE_TTL_MS = 60_000;
let _cache: { rows: RegistryGame[]; expiresAt: number } | null = null;

type GameRow = typeof games.$inferSelect;

function mapRow(r: GameRow): RegistryGame {
  return {
    slug: r.slug as RegistryGame["slug"],
    gameType: r.game_type,
    title: r.title,
    subtitle: r.subtitle,
    emoji: r.emoji,
    gradient: r.gradient,
    glow: r.glow,
    payoutLabel: r.payout_label,
    badge: r.badge,
    featured: r.featured,
    sortOrder: r.sort_order,
    status: coerceGameStatus(r.status),
    cardImageUrl: r.card_image_url,
    loadingImageUrl: r.loading_image_url,
    bannerImageUrl: r.banner_image_url,
  };
}

// Every game ordered by sort_order. Falls back to the static catalogue if the table
// is empty (not seeded yet) or unreachable — the lobby must never break.
export async function getAllGames(): Promise<RegistryGame[]> {
  const now = Date.now();
  if (_cache && _cache.expiresAt > now) return _cache.rows;

  try {
    const rows = await db.select().from(games).orderBy(asc(games.sort_order));
    // Drop any row whose slug has no matching code (engine/component) — defensive
    // against a stale registry row pointing at a removed game.
    const mapped = rows.filter((r) => isGameSlug(r.slug)).map(mapRow);
    // Merge in catalogue games the table doesn't know yet (a code-shipped game
    // whose registry row hasn't been seeded) — the lobby must always reflect the
    // full catalogue. Admin can still hide/tune it once the row is inserted.
    const known = new Set(mapped.map((g) => g.slug));
    const missing = catalogueFallbackGames().filter((g) => !known.has(g.slug));
    const merged = mapped.length > 0 ? [...mapped, ...missing] : catalogueFallbackGames();
    _cache = { rows: merged, expiresAt: now + CACHE_TTL_MS };
    return merged;
  } catch {
    return catalogueFallbackGames();
  }
}

export function invalidateGamesCache() {
  _cache = null;
}

// What the lobby renders: everything except fully hidden games (live, coming_soon,
// maintenance). Playability is decided per-status by the lobby + server actions.
export async function getLobbyGames(): Promise<RegistryGame[]> {
  const all = await getAllGames();
  return all.filter((g) => g.status !== "hidden");
}

export async function getGameStatusByType(gameType: string): Promise<GameStatus | null> {
  const all = await getAllGames();
  return all.find((g) => g.gameType === gameType)?.status ?? null;
}

// THE server-side gate. Called at the top of every "start / place bet" action so a
// non-live game can't be played even via a deep link or a direct API call. The
// reveal/settle/cashout actions deliberately do NOT call this, so a round already in
// progress can always be finished (the "let in-flight rounds finish" rule).
//
// Fail-open: a gameType with no registry row (e.g. before the table is seeded) stays
// playable — absence never takes the casino offline; only an explicit non-live
// status blocks play.
export async function assertGamePlayable(gameType: string): Promise<void> {
  const status = await getGameStatusByType(gameType);
  if (status != null && status !== "live") {
    throw new Error("This game is currently unavailable. Please try again later.");
  }
}
