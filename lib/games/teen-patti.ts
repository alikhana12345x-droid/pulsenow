// Teen Patti 20-20 — shared config + portfolio payout math. Imported by BOTH the
// server (game-engine / action) and the client (round loop, bet zones, spectator
// rounds) so the two never drift. Pure — no crypto or server-only imports.
//
// Two three-card hands are dealt, Player A and Player B; the better hand wins.
// Players may stake any combination of four zones — the two sides, plus a
// "Pair Plus" side bet on each hand being Pair-or-better — so a round settles a
// PORTFOLIO. House safety therefore uses the qMax portfolio cap (same doctrine as
// Plinko / Keno / Dragon vs Tiger), not the single-multiplier cap.
//
// ── Locked design decisions ───────────────────────────────────────────────────
// 1. TIES ARE RE-DEALT, not paid. An exact tie (same category AND same ranks) is
//    0.1117% — 1 in 895 rounds. A tie bet zone would sit dead for hours, and a
//    "push" refund is a 1× PAYING outcome that would break the binary cap. The
//    outcome space below is therefore tie-free and strictly binary per zone.
// 2. THE SIDES PAY 1.96×, NOT 2×. With ties removed A vs B is exactly 50/50, so a
//    2× payout would be a ZERO natural-edge game. Dragon vs Tiger can afford 2×
//    only because its 7.7% tie absorbs the edge. 1.96 matches AB_MULTIPLIER and
//    COINFLIP_MULTIPLIER — a 2% natural edge before the engine does anything.
// 3. PAIR PLUS PAYS A FLAT 3.70×. Flat, not the tiered 3-card-poker ladder, so
//    every single zone stays clean win-or-nothing. (The tiered ladder — Pair 2×,
//    Colour 4×, Sequence 7×, Pure Seq 31×, Trail 41×, 7.0% edge — is a v2 and
//    would need its own qMax over the payout tiers.)
// 4. A-2-3 IS THE SECOND-HIGHEST SEQUENCE, directly below A-K-Q. Not the lowest.
//    This is the classic Teen Patti implementation bug; see tpSequenceHigh().

// ─── Round clock ──────────────────────────────────────────────────────────────

export const TP_BETTING_SECONDS = 20;
export const TP_FREE_SECONDS = 10;
// Bets lock this long before the deal; the round request is prefetched in this
// window (SkyRise / Dragon Tiger pattern) so hands turn over the instant the
// countdown empties.
export const TP_BETS_LOCK_SECONDS = 1.5;

export const TP_HOUSE_EDGE = 0.05;
export const TP_MIN_TOTAL = 10;     // also the per-zone minimum (smallest chip)
export const TP_MAX_TOTAL = 20000;
export const TP_CHIP_VALUES = [10, 50, 100, 500, 1000, 5000, 10000] as const;

// ─── Zones ────────────────────────────────────────────────────────────────────

// Display order: A's side on the left, B's on the right, Pair Plus inboard.
export const TP_ZONES = ["player-a", "pp-a", "pp-b", "player-b"] as const;
export type TpZone = (typeof TP_ZONES)[number];
export type TpBets = Record<TpZone, number>;

// Total-return multiples (stake included): 1.96× on a side, 3.70× on Pair Plus.
//
// NOTE — the both-sides hedge. Staking player-a AND player-b equally returns
// 1.96/2 = 0.98× on EVERY outcome: a guaranteed 2% loss for the player, a
// guaranteed 2% hold for the house, and nothing the win-probability cap can steer
// (no outcome is net-positive, so the win set is empty). It is SAFE — the house
// cannot lose — but the hold is 2%, not the 5% TP_HOUSE_EDGE target. This is the
// same arithmetic as Coin Flip / Andar Bahar's 1.96×; Teen Patti is just the first
// game where a player can hold both sides in one round. Left allowed: it is a
// guaranteed loss, so it is self-discouraging. Worth watching only if turnover-
// based promotions ever let it clear a wagering requirement cheaply.
export const TP_PAYOUT: Record<TpZone, number> = {
  "player-a": 1.96,
  "pp-a": 3.7,
  "pp-b": 3.7,
  "player-b": 1.96,
};

// ─── Cards ────────────────────────────────────────────────────────────────────

// rank 0..12 = A..K, suit 0..3 — matches the shared PlayingCard indexing.
export type TpCard = { rank: number; suit: number };
export type TpHand = [TpCard, TpCard, TpCard];

// Teen Patti plays the Ace HIGH (A-K-Q is the top sequence), but the shared card
// index has A at 0. Map index → playing value: A=14, 2..10 = 2..10, J/Q/K = 11/12/13.
export function tpRankValue(rankIndex: number): number {
  return rankIndex === 0 ? 14 : rankIndex + 1;
}

// ─── Hand ranking ─────────────────────────────────────────────────────────────

export const TP_CAT = {
  HIGH: 0,
  PAIR: 1,
  COLOUR: 2,
  SEQUENCE: 3,
  PURE_SEQUENCE: 4,
  TRAIL: 5,
} as const;
export type TpCat = (typeof TP_CAT)[keyof typeof TP_CAT];

export const TP_CAT_LABEL: Record<TpCat, string> = {
  [TP_CAT.HIGH]: "High Card",
  [TP_CAT.PAIR]: "Pair",
  [TP_CAT.COLOUR]: "Colour",
  [TP_CAT.SEQUENCE]: "Sequence",
  [TP_CAT.PURE_SEQUENCE]: "Pure Sequence",
  [TP_CAT.TRAIL]: "Trail",
};

// Reveal-badge art, generated per lib/docs/new-games/game-7-teen-patti-assets.md.
export const TP_CAT_BADGE: Record<TpCat, string> = {
  [TP_CAT.HIGH]: "/games/teen-patti/rank-high.webp",
  [TP_CAT.PAIR]: "/games/teen-patti/rank-pair.webp",
  [TP_CAT.COLOUR]: "/games/teen-patti/rank-colour.webp",
  [TP_CAT.SEQUENCE]: "/games/teen-patti/rank-seq.webp",
  [TP_CAT.PURE_SEQUENCE]: "/games/teen-patti/rank-pure-seq.webp",
  [TP_CAT.TRAIL]: "/games/teen-patti/rank-trail.webp",
};

// [category, tiebreak1, tiebreak2, tiebreak3] — compare lexicographically.
export type TpScore = readonly [number, number, number, number];

// Returns the sequence's "high" value, or 0 if the three values aren't a run.
// A-K-Q (14,13,12) is the highest at 14; A-2-3 (14,3,2) is the SECOND highest and
// scores 13.5 so it slots between A-K-Q and K-Q-J without a special case anywhere
// else. Everything else is just its own high card.
function tpSequenceHigh(hi: number, mid: number, lo: number): number {
  if (hi === 14 && mid === 3 && lo === 2) return 13.5;
  if (hi - 1 === mid && mid - 1 === lo) return hi;
  return 0;
}

export function scoreTpHand(hand: TpHand): TpScore {
  const [hi, mid, lo] = hand.map((c) => tpRankValue(c.rank)).sort((a, b) => b - a);
  const flush = hand[0].suit === hand[1].suit && hand[1].suit === hand[2].suit;

  if (hi === mid && mid === lo) return [TP_CAT.TRAIL, hi, 0, 0];

  const seqHigh = tpSequenceHigh(hi, mid, lo);
  if (seqHigh > 0) return [flush ? TP_CAT.PURE_SEQUENCE : TP_CAT.SEQUENCE, seqHigh, 0, 0];
  if (flush) return [TP_CAT.COLOUR, hi, mid, lo];

  // Pair: the paired rank leads, the kicker follows.
  if (hi === mid) return [TP_CAT.PAIR, hi, lo, 0];
  if (mid === lo) return [TP_CAT.PAIR, mid, hi, 0];
  if (hi === lo) return [TP_CAT.PAIR, hi, mid, 0];

  return [TP_CAT.HIGH, hi, mid, lo];
}

// >0 if a beats b, <0 if b beats a, 0 for an exact tie (which never survives the
// deal — see dealTpHands).
export function compareTpHands(a: TpScore, b: TpScore): number {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

export function isTpPairPlus(score: TpScore): boolean {
  return score[0] >= TP_CAT.PAIR;
}

// ─── Outcome space ────────────────────────────────────────────────────────────

export type TpWinner = "player-a" | "player-b";

// Six outcomes, not eight: `A wins & only B is Pair+` is impossible, because any
// Pair-or-better beats High Card. Naming: <winner>-<shape>, where the shape is
// which hands reached Pair+ — none, the winner only, or both.
export const TP_OUTCOMES = ["a-high", "a-pp", "a-both", "b-high", "b-pp", "b-both"] as const;
export type TpOutcomeKey = (typeof TP_OUTCOMES)[number];

export interface TpOutcome {
  winner: TpWinner;
  ppA: boolean;
  ppB: boolean;
}

export const TP_OUTCOME: Record<TpOutcomeKey, TpOutcome> = {
  "a-high": { winner: "player-a", ppA: false, ppB: false },
  "a-pp":   { winner: "player-a", ppA: true,  ppB: false },
  "a-both": { winner: "player-a", ppA: true,  ppB: true  },
  "b-high": { winner: "player-b", ppA: false, ppB: false },
  "b-pp":   { winner: "player-b", ppA: false, ppB: true  },
  "b-both": { winner: "player-b", ppA: true,  ppB: true  },
};

// Natural (tie-free) frequencies, measured over 10M dealt rounds and symmetrised
// across the two sides — regenerate with `node scripts/teen-patti-odds.mjs`.
// Sanity: P(a side wins) = 0.5; P(a given side is Pair+) = 0.190420 + 2×0.032950
// = 0.25632, which is what prices Pair Plus at 3.70× for a 5% edge.
export const TP_NATURAL: Record<TpOutcomeKey, number> = {
  "a-high": 0.276630,
  "a-pp":   0.190420,
  "a-both": 0.032950,
  "b-high": 0.276630,
  "b-pp":   0.190420,
  "b-both": 0.032950,
};

// The shape of a dealt round, ignoring which side holds the winning hand. Used by
// the dealer: orientation is free (the two hands are symmetric), so only the shape
// has to be sampled.
export type TpShape = "high" | "pp" | "both";

export function tpShapeOf(key: TpOutcomeKey): TpShape {
  return key.endsWith("-both") ? "both" : key.endsWith("-pp") ? "pp" : "high";
}

// ─── Bets ─────────────────────────────────────────────────────────────────────

export function isTpZone(v: unknown): v is TpZone {
  return (TP_ZONES as readonly string[]).includes(v as string);
}

export function emptyTpBets(): TpBets {
  return { "player-a": 0, "pp-a": 0, "pp-b": 0, "player-b": 0 };
}

export function tpTotal(bets: TpBets): number {
  return TP_ZONES.reduce((s, z) => s + bets[z], 0);
}

// Server-side validation of the client payload. Returns a clean TpBets or null.
// Every staked zone must be an integer ≥ the smallest chip; round total 10–20,000.
export function normalizeTpBets(input: unknown): TpBets | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  const bets = emptyTpBets();
  for (const zone of TP_ZONES) {
    const v = raw[zone];
    if (v == null) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) return null;
    if (v > 0 && v < TP_MIN_TOTAL) return null;
    bets[zone] = v;
  }
  const total = tpTotal(bets);
  if (total < TP_MIN_TOTAL || total > TP_MAX_TOTAL) return null;
  return bets;
}

// Which zones this outcome pays.
export function tpZoneWins(zone: TpZone, outcome: TpOutcome): boolean {
  switch (zone) {
    case "player-a": return outcome.winner === "player-a";
    case "player-b": return outcome.winner === "player-b";
    case "pp-a": return outcome.ppA;
    case "pp-b": return outcome.ppB;
  }
}

// Total money returned to the player for a given outcome.
export function tpReturn(bets: TpBets, key: TpOutcomeKey): number {
  const outcome = TP_OUTCOME[key];
  let total = 0;
  for (const zone of TP_ZONES) {
    if (bets[zone] > 0 && tpZoneWins(zone, outcome)) total += bets[zone] * TP_PAYOUT[zone];
  }
  return total;
}

// ─── Portfolio math ───────────────────────────────────────────────────────────

// W = outcomes strictly net-positive for the player; L = the rest (break-even
// counts as a loss — safety). A / B are the expected per-unit returns conditional
// on landing in W / L, weighted by natural odds.
export function tpStats(bets: TpBets): {
  winSet: TpOutcomeKey[];
  lossSet: TpOutcomeKey[];
  A: number;
  B: number;
} {
  const S = tpTotal(bets);
  const winSet: TpOutcomeKey[] = [];
  const lossSet: TpOutcomeKey[] = [];
  let wp = 0, wa = 0, lp = 0, la = 0;
  for (const key of TP_OUTCOMES) {
    const r = S > 0 ? tpReturn(bets, key) / S : 0;
    const p = TP_NATURAL[key];
    if (r > 1 + 1e-9) { winSet.push(key); wp += p; wa += p * r; }
    else { lossSet.push(key); lp += p; la += p * r; }
  }
  return { winSet, lossSet, A: wp > 0 ? wa / wp : 0, B: lp > 0 ? la / lp : 0 };
}

// The house-never-loses ceiling for this portfolio: EV(q) = q·A + (1−q)·B must
// stay ≤ 1 − edge, so qMax = (1 − edge − B) / (A − B). At the 5% edge:
// 100 on player-a → 48.47%; 100 on pp-a → 25.68%; an a+b hedge → 0 (W empty).
export function tpMaxWinPct(bets: TpBets): number {
  const { winSet, A, B } = tpStats(bets);
  if (winSet.length === 0 || A <= B) return 0;
  const q = (1 - TP_HOUSE_EDGE - B) / (A - B);
  return Math.max(0, Math.min(1, q)) * 100;
}

// Theoretical EV per unit staked at the given (already-capped) win probability —
// snapshotted onto the round as expected_rtp. With an empty win set (a full hedge)
// the engine forces a loss-set outcome regardless of the configured pct (even for
// promo players — no net-positive outcome exists), so q is 0 there.
export function tpExpectedRtp(bets: TpBets, effectivePct: number): number {
  const { winSet, A, B } = tpStats(bets);
  const q = winSet.length === 0 ? 0 : effectivePct / 100;
  return q * A + (1 - q) * B;
}

// Sample an outcome from `set`, weighted by the natural odds (renormalised).
export function pickTpOutcomeWeighted(set: TpOutcomeKey[], rng: () => number): TpOutcomeKey {
  const total = set.reduce((s, k) => s + TP_NATURAL[k], 0);
  let r = rng() * total;
  for (const key of set) {
    r -= TP_NATURAL[key];
    if (r <= 0) return key;
  }
  return set[set.length - 1];
}

// ─── Dealing ──────────────────────────────────────────────────────────────────

// Deal six distinct cards. Partial Fisher-Yates — only the first six slots matter.
function dealSix(rng: () => number): TpCard[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const out: TpCard[] = [];
  for (let i = 0; i < 6; i++) {
    const j = i + Math.floor(rng() * (52 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
    out.push({ rank: deck[i] % 13, suit: Math.floor(deck[i] / 13) });
  }
  return out;
}

export interface TpDeal {
  handA: TpHand;
  handB: TpHand;
  scoreA: TpScore;
  scoreB: TpScore;
  outcome: TpOutcomeKey;
}

// Build the round the player will see, consistent with an already-decided outcome
// — presentation for a decided result, same doctrine as Andar Bahar / Plinko /
// Keno / Dragon Tiger.
//
// The trick that makes this cheap: the two hands are SYMMETRIC, so orientation is
// free. Deal naturally, and if the deal's shape (nobody Pair+, winner only, or
// both) matches the target, hand the winning cards to the intended winner. That
// preserves the natural hand distribution EXACTLY — the cards survive inspection —
// and only the shape needs rejection sampling. Worst case is the "both" shape at
// 6.59%, so ~15 deals expected; exact ties are rejected here too and never reach
// settlement.
//
// The outcome is re-derived from the cards actually dealt rather than assumed, so
// the hands on screen and the money paid can never disagree.
export function dealTpHands(target: TpOutcomeKey, rng: () => number, maxTries = 5000): TpDeal {
  const wantShape = tpShapeOf(target);
  const wantWinner = TP_OUTCOME[target].winner;
  let last: TpDeal | null = null;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const c = dealSix(rng);
    const h1 = [c[0], c[2], c[4]] as TpHand;
    const h2 = [c[1], c[3], c[5]] as TpHand;
    const s1 = scoreTpHand(h1);
    const s2 = scoreTpHand(h2);
    const cmp = compareTpHands(s1, s2);
    if (cmp === 0) continue; // decision 1: ties are re-dealt, never paid

    const winHand = cmp > 0 ? h1 : h2;
    const loseHand = cmp > 0 ? h2 : h1;
    const winScore = cmp > 0 ? s1 : s2;
    const loseScore = cmp > 0 ? s2 : s1;

    const shape: TpShape = isTpPairPlus(loseScore) ? "both" : isTpPairPlus(winScore) ? "pp" : "high";

    // Orientation is free — give the winning hand to whichever side should win.
    const aWins = wantWinner === "player-a";
    const deal: TpDeal = {
      handA: aWins ? winHand : loseHand,
      handB: aWins ? loseHand : winHand,
      scoreA: aWins ? winScore : loseScore,
      scoreB: aWins ? loseScore : winScore,
      outcome: `${aWins ? "a" : "b"}-${shape}` as TpOutcomeKey,
    };
    last = deal;
    if (shape === wantShape) return deal;
  }

  // Unreachable in practice — P(5000 misses) < e^-300 even for the rarest shape.
  // Returning the last real deal keeps cards and settlement consistent; the caller
  // settles on `outcome`, which is derived from these cards.
  return last ?? dealTpHands("a-high", rng, 1);
}

// Spectator rounds (no player stake): a straight natural deal, no server involved
// and no target to hit — just reject the rare exact tie and report what fell.
export function sampleNaturalTpOutcome(rng: () => number, maxTries = 5000): TpDeal {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const c = dealSix(rng);
    const handA = [c[0], c[2], c[4]] as TpHand;
    const handB = [c[1], c[3], c[5]] as TpHand;
    const scoreA = scoreTpHand(handA);
    const scoreB = scoreTpHand(handB);
    const cmp = compareTpHands(scoreA, scoreB);
    if (cmp === 0) continue;

    const aWins = cmp > 0;
    const winScore = aWins ? scoreA : scoreB;
    const loseScore = aWins ? scoreB : scoreA;
    const shape: TpShape = isTpPairPlus(loseScore) ? "both" : isTpPairPlus(winScore) ? "pp" : "high";
    return {
      handA, handB, scoreA, scoreB,
      outcome: `${aWins ? "a" : "b"}-${shape}` as TpOutcomeKey,
    };
  }
  return dealTpHands("a-high", rng);
}
