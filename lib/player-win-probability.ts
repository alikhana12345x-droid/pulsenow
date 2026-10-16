import { db } from "@/lib/db";
import { promotion_players, bet_amount_tiers } from "@/lib/supabase/schema";
import { eq, and, asc } from "drizzle-orm";

// ─── In-memory tier cache ──────────────────────────────────────────────────────
// Tiers change rarely (admin-only). Cache them for 60 s so every game round
// pays zero DB round-trips on a cache hit. On a cache miss both the promo-player
// query and the tiers fetch run in parallel, so latency stays the same as before.

const TIER_CACHE_TTL_MS = 60_000;
type TierRow = typeof bet_amount_tiers.$inferSelect;
let _tiersCache: { rows: TierRow[]; expiresAt: number } | null = null;

async function getCachedTiers(): Promise<TierRow[]> {
  const now = Date.now();
  if (_tiersCache && _tiersCache.expiresAt > now) return _tiersCache.rows;
  const rows = await db
    .select()
    .from(bet_amount_tiers)
    .where(eq(bet_amount_tiers.is_active, true))
    .orderBy(asc(bet_amount_tiers.sort_order));
  _tiersCache = { rows, expiresAt: now + TIER_CACHE_TTL_MS };
  return rows;
}

// Called by admin server actions immediately after any tier mutation.
export function invalidateTiersCache() {
  _tiersCache = null;
}

// ─── Configuration ─────────────────────────────────────────────────────────────
// Fallback for NORMAL (non-promo) players when betAmount is not provided or falls
// outside all active tiers. Kept low so the house stays safe even on the games
// that don't apply a house-edge cap (e.g. mines): EV there is 0.95 × this value.
export const DEFAULT_WIN_PROBABILITY = 20; // percent (0–100)

// Tiers configured ABOVE this are honoured exactly, like a promo; tiers at or
// below it keep the per-game house-edge cap. Admin's call: a tier set to 90%
// should actually win 90% of rounds, while low tiers stay house-safe.
export const UNCAPPED_TIER_THRESHOLD = 50; // percent

// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedWinProbability {
  /** The win-probability % to use for this player (0–100). */
  winProbability: number;
  /**
   * True only for active promotion players. Snapshotted on game_rounds.is_promo
   * so reports can split promo traffic from normal play.
   */
  isPromo: boolean;
  /**
   * True when winProbability must be honoured EXACTLY, skipping the per-game
   * house-edge ceiling — even when that means the house loses on the bet.
   * Set for promo players and for tiers above UNCAPPED_TIER_THRESHOLD.
   * Otherwise games pass winProbability through their cap
   * (capWinProbabilityForHouseEdge & co.) so the house never loses.
   */
  uncapped: boolean;
}

/**
 * Resolves the effective win-probability for a player and flags its source:
 *  - Promotion players → their configured win_probability_boost, isPromo=true,
 *                        uncapped=true
 *  - Everyone else     → tier-matched probability based on betAmount (from DB,
 *                        cached 60 s), uncapped when the tier is above
 *                        UNCAPPED_TIER_THRESHOLD; or DEFAULT_WIN_PROBABILITY
 *                        (capped). isPromo=false
 */
export async function getPlayerWinProbability(
  userId: string,
  betAmount?: number
): Promise<ResolvedWinProbability> {
  // Both queries fire in parallel — tiers is a cache hit 99% of the time.
  const [promoRows, tiers] = await Promise.all([
    db
      .select({ boost: promotion_players.win_probability_boost })
      .from(promotion_players)
      .where(
        and(
          eq(promotion_players.user_id, userId),
          eq(promotion_players.is_active, true)
        )
      )
      .limit(1),
    getCachedTiers(),
  ]);

  if (promoRows[0]) {
    return {
      winProbability: Math.min(100, Math.max(0, Number(promoRows[0].boost))),
      isPromo: true,
      uncapped: true,
    };
  }

  if (betAmount != null) {
    const tier = tiers.find(
      (t) => betAmount >= Number(t.min_amount) && betAmount <= Number(t.max_amount)
    );
    if (tier) {
      return {
        winProbability: tier.win_probability,
        isPromo: false,
        uncapped: tier.win_probability > UNCAPPED_TIER_THRESHOLD,
      };
    }
  }

  return { winProbability: DEFAULT_WIN_PROBABILITY, isPromo: false, uncapped: false };
}
