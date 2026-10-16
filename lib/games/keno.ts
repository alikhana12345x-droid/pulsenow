// Keno — shared config + payout math. Imported by BOTH the server (game-engine /
// action) and the client (grid + live paytable panel) so the two never drift. Pure.
//
// The player picks 1..10 numbers from 1..40; the house draws 10; payout scales with
// how many picks are hit. P(hits=h) is hypergeometric; the paytables below were
// generated + verified (scripts/keno-design) to a fair EV ~0.95-0.98 with jackpots
// capped at 1000x so max exposure on a 20k bet stays ~20M (in line with Plinko/Mines).

export const KENO_POOL = 40;
export const KENO_DRAW = 10;
export const KENO_MAX_PICKS = 10;
export const KENO_HOUSE_EDGE = 0.01;

// PAYTABLE[picksCount][hits] = multiplier (0 = no payout). Losing hit counts pay 0
// (Keno is win-or-nothing), so there are no sub-1x consolation tiers.
export const KENO_PAYTABLE: Record<number, number[]> = {
  1: [0, 3.9],
  2: [0, 0, 17],
  3: [0, 0, 2.7, 50],
  4: [0, 0, 1.8, 11, 69],
  5: [0, 0, 0, 4.8, 45, 415],
  6: [0, 0, 0, 2.9, 16, 92, 520],
  7: [0, 0, 0, 0, 9.4, 64, 430, 1000],
  8: [0, 0, 0, 0, 5.7, 27, 130, 615, 1000],
  9: [0, 0, 0, 0, 3.8, 14, 52, 190, 700, 1000],
  10: [0, 0, 0, 0, 0, 12, 47, 180, 680, 1000, 1000],
};

function comb(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  r = Math.min(r, n - r);
  let c = 1;
  for (let i = 0; i < r; i++) c = (c * (n - i)) / (i + 1);
  return c;
}

// Hypergeometric P(hits = h) for picking k of KENO_POOL, with KENO_DRAW drawn. h = 0..k.
export function kenoHyper(k: number): number[] {
  const tot = comb(KENO_POOL, KENO_DRAW);
  const p: number[] = [];
  for (let h = 0; h <= k; h++) {
    p.push((comb(k, h) * comb(KENO_POOL - k, KENO_DRAW - h)) / tot);
  }
  return p;
}

export function kenoMultiplier(k: number, hits: number): number {
  return KENO_PAYTABLE[k]?.[hits] ?? 0;
}

export function kenoMaxMultiplier(k: number): number {
  const t = KENO_PAYTABLE[k];
  return t ? Math.max(...t) : 0;
}

export function isValidKenoPicks(picks: unknown): picks is number[] {
  if (!Array.isArray(picks)) return false;
  if (picks.length < 1 || picks.length > KENO_MAX_PICKS) return false;
  const seen = new Set<number>();
  for (const n of picks) {
    if (!Number.isInteger(n) || n < 1 || n > KENO_POOL || seen.has(n)) return false;
    seen.add(n);
  }
  return true;
}

// Highest win probability a NORMAL player may have for this pick count without the
// house losing. Winning hit counts (mult > 1) form set W, the rest L. With a win
// round landing in W and a loss round in L, EV = q*A + (1-q)*B where A = E[mult|W],
// B = E[mult|L]; EV <= 1-edge gives qMax = (1-edge-B)/(A-B). Returns 0..100.
// Conditional mean multipliers: A = E[mult | winning hit count], B = E[mult | losing].
function kenoConditionalMeans(k: number): { A: number; B: number } {
  const mults = KENO_PAYTABLE[k];
  if (!mults) return { A: 0, B: 0 };
  const p = kenoHyper(k);
  let PW = 0, PL = 0, sumW = 0, sumL = 0;
  for (let h = 0; h < mults.length; h++) {
    if (mults[h] > 1) { PW += p[h]; sumW += p[h] * mults[h]; }
    else { PL += p[h]; sumL += p[h] * mults[h]; }
  }
  return { A: PW > 0 ? sumW / PW : 0, B: PL > 0 ? sumL / PL : 0 };
}

export function kenoMaxWinPct(k: number, edge = KENO_HOUSE_EDGE): number {
  const { A, B } = kenoConditionalMeans(k);
  if (A <= B) return 0;
  return Math.max(0, Math.min(1, (1 - edge - B) / (A - B))) * 100;
}

// Exact theoretical RTP for a round played at effective win probability qPct:
// EV = q·E[mult|win] + (1−q)·E[mult|loss] (B = 0 for keno — losses pay nothing).
// Snapshotted per round for reports.
export function kenoExpectedRtp(k: number, qPct: number): number {
  const { A, B } = kenoConditionalMeans(k);
  const q = Math.max(0, Math.min(1, qPct / 100));
  return q * A + (1 - q) * B;
}
