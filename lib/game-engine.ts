import crypto from "crypto";
import { PLINKO_PAYTABLE, binomialWeights, type PlinkoRows, type PlinkoRisk } from "@/lib/games/plinko";
import { KENO_POOL, KENO_DRAW, KENO_PAYTABLE, kenoHyper } from "@/lib/games/keno";
import { dtStats, pickDtZoneWeighted, dealDtCards, type DtBets, type DtZone, type DtCard } from "@/lib/games/dragon-tiger";
import { tpStats, pickTpOutcomeWeighted, dealTpHands, type TpBets, type TpDeal } from "@/lib/games/teen-patti";

export function generateServerSeed(): { seed: string; hash: string } {
  const seed = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  return { seed, hash };
}

// Produces a float in [0, 1) using HMAC-SHA256 (bytes 0-3 of digest)
function generateFloat(serverSeed: string, clientSeed: string, nonce: number): number {
  const hmac = crypto.createHmac("sha256", serverSeed);
  hmac.update(`${clientSeed}:${nonce}`);
  const hex = hmac.digest("hex");
  return parseInt(hex.slice(0, 8), 16) / 0x100000000;
}

// Second independent float from the same digest (bytes 4-7)
function generateFloat2(serverSeed: string, clientSeed: string, nonce: number): number {
  const hmac = crypto.createHmac("sha256", serverSeed);
  hmac.update(`${clientSeed}:${nonce}`);
  const hex = hmac.digest("hex");
  return parseInt(hex.slice(8, 16), 16) / 0x100000000;
}

// Dice: returns 0.00 – 99.99
export function rollDice(serverSeed: string, clientSeed: string, nonce: number): number {
  return Math.floor(generateFloat(serverSeed, clientSeed, nonce) * 10000) / 100;
}

export function diceWinChance(target: number, side: "over" | "under"): number {
  return side === "over" ? 99 - target : target;
}

export function diceMultiplier(target: number, side: "over" | "under", houseEdge = 0.01): number {
  const winChance = diceWinChance(target, side) / 100;
  if (winChance <= 0) return 0;
  return parseFloat(((1 - houseEdge) / winChance).toFixed(4));
}

export function diceWins(roll: number, target: number, side: "over" | "under"): boolean {
  return side === "over" ? roll > target : roll < target;
}

// Coin flip: returns "heads" or "tails"
export function flipCoin(serverSeed: string, clientSeed: string, nonce: number): "heads" | "tails" {
  return generateFloat(serverSeed, clientSeed, nonce) < 0.5 ? "heads" : "tails";
}

export const COINFLIP_HOUSE_EDGE = 0.02;
export const COINFLIP_MULTIPLIER = parseFloat(((1 - COINFLIP_HOUSE_EDGE) / 0.5).toFixed(4)); // 1.96

// ── Probability-controlled variants ──────────────────────────────────────────
// These replace the pure-RNG functions when a win probability override is active.
// float1 (bytes 0-3) decides win vs loss; float2 (bytes 4-7) picks the value
// within the resulting zone so the displayed number still looks random.

export function rollDiceWithProbability(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  winProbabilityPct: number,
  target: number,
  side: "over" | "under",
): number {
  const playerWins = generateFloat(serverSeed, clientSeed, nonce) < winProbabilityPct / 100;
  const r = generateFloat2(serverSeed, clientSeed, nonce);
  // Dice values are integers 0–9999 displayed as 0.00–99.99
  const targetInt = Math.round(target * 100);

  if (side === "over") {
    if (playerWins) {
      const count = 9999 - targetInt; // win zone: targetInt+1 … 9999
      if (count <= 0) return 99.99;
      return (targetInt + 1 + Math.floor(r * count)) / 100;
    } else {
      const count = targetInt + 1; // loss zone: 0 … targetInt
      return Math.floor(r * count) / 100;
    }
  } else {
    if (playerWins) {
      const count = targetInt; // win zone: 0 … targetInt-1
      if (count <= 0) return 0;
      return Math.floor(r * count) / 100;
    } else {
      const count = 10000 - targetInt; // loss zone: targetInt … 9999
      return (targetInt + Math.floor(r * count)) / 100;
    }
  }
}

export function flipCoinWithProbability(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  winProbabilityPct: number,
  pick: "heads" | "tails",
): "heads" | "tails" {
  const playerWins = generateFloat(serverSeed, clientSeed, nonce) < winProbabilityPct / 100;
  return playerWins ? pick : (pick === "heads" ? "tails" : "heads");
}

// Limbo: the player picks a target multiplier and wins if the rolled multiplier is
// at or above it. float1 decides win/loss (honouring the capped win probability);
// float2 places the displayed result inside the winning [target, max] zone (skewed
// so most wins land just above target) or the losing [1.00, target) zone.
//
// `won` is the AUTHORITATIVE outcome — callers must not re-derive it from the rounded
// `result`, whose 2-dp rounding could otherwise straddle the target boundary.
export function rollLimboWithProbability(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  winProbabilityPct: number,
  target: number,
  maxMultiplier = 1_000_000,
): { result: number; won: boolean } {
  const won = generateFloat(serverSeed, clientSeed, nonce) < winProbabilityPct / 100;
  const r = generateFloat2(serverSeed, clientSeed, nonce);

  if (won) {
    // Win zone [target, maxMultiplier]: result = target / (1 − r·(1 − target/max)).
    // r→0 gives ~target, r→1 approaches max, so the long tail is rare.
    const raw = target / (1 - r * (1 - target / maxMultiplier));
    const result = Math.max(target, parseFloat(raw.toFixed(2)));
    return { result, won };
  }

  // Loss zone [1.00, target): clamp strictly below target so rounding can't reach it.
  const span = Math.max(0, target - 1.01);
  let result = parseFloat((1 + r * span).toFixed(2));
  if (result >= target) result = parseFloat((target - 0.01).toFixed(2));
  return { result, won };
}

// ── House-edge ceiling ────────────────────────────────────────────────────────
// THE house-never-loses guarantee. A bet's expected value is
//   EV = (winPct/100) × multiplier
// so the house only profits while EV ≤ 1 − houseEdge. Because the player chooses
// the multiplier (dice target, skyrise cashout, hi-lo streak), an uncapped win
// probability lets EV exceed 1 on any high-multiplier bet — the house bleeds even
// at a "low" 15% win rate (15% × 99× = 14.85). This caps the EFFECTIVE win
// probability at the highest value that still preserves the edge:
//   maxPct = (1 − houseEdge) × 100 / multiplier
// Admin/tier/promo win probabilities below the ceiling are honoured exactly; only
// values that would make the house lose are clamped down. Returns 0 for a
// non-positive multiplier (no payout is possible, so a "win" is meaningless).
export function capWinProbabilityForHouseEdge(
  configuredPct: number,
  multiplier: number,
  houseEdge: number,
): number {
  if (multiplier <= 0) return 0;
  const maxPct = ((1 - houseEdge) * 100) / multiplier;
  return Math.max(0, Math.min(configuredPct, maxPct));
}

// ── Andar Bahar ────────────────────────────────────────────────────────────
// A joker card is revealed, then cards are dealt alternately to the Andar and
// Bahar piles until a card matching the joker's RANK appears; the side it lands
// on wins. Even-money bet → fixed multiplier with a built-in edge (like Coin Flip).

export const AB_HOUSE_EDGE = 0.02;
export const AB_MULTIPLIER = parseFloat(((1 - AB_HOUSE_EDGE) / 0.5).toFixed(4)); // 1.96
const AB_MAX_PER_SIDE = 24; // termination safety bound

export type ABCard = { rank: number; suit: number };
export type ABSide = "andar" | "bahar";

// Deterministic PRNG stream seeded from the server seed (provably fair).
function seededStream(serverSeed: string, tag: string): () => number {
  const hmac = crypto.createHmac("sha256", serverSeed);
  hmac.update(tag);
  const hex = hmac.digest("hex");
  let a = parseInt(hex.slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The win/loss is decided FIRST from the win probability; the deal is then
// arranged so the first rank-match lands on the winning side. Every non-match
// card is forced to a different rank, so the placed match is the only match.
export function dealAndarBahar(
  serverSeed: string,
  winProbabilityPct: number,
  pickedSide: ABSide,
): { joker: ABCard; andar: ABCard[]; bahar: ABCard[]; matchSide: ABSide; win: boolean } {
  const rng = seededStream(serverSeed, "andar-bahar");
  const win = rng() < winProbabilityPct / 100;
  const matchSide: ABSide = win ? pickedSide : (pickedSide === "andar" ? "bahar" : "andar");

  const jokerRank = Math.floor(rng() * 13);
  const joker: ABCard = { rank: jokerRank, suit: Math.floor(rng() * 4) };

  // A card whose rank is guaranteed NOT to equal the joker's.
  const nonMatch = (): ABCard => {
    const offset = 1 + Math.floor(rng() * 12); // 1..12 → never 0 mod 13
    return { rank: (jokerRank + offset) % 13, suit: Math.floor(rng() * 4) };
  };

  const andar: ABCard[] = [];
  const bahar: ABCard[] = [];
  const preMatch = Math.floor(rng() * 10); // 0..9 non-matching cards for animation flavour

  let side: ABSide = "andar"; // Andar is dealt first, by convention
  let dealt = 0;
  while (dealt < AB_MAX_PER_SIDE * 2) {
    if (dealt >= preMatch && side === matchSide) {
      (side === "andar" ? andar : bahar).push({ rank: jokerRank, suit: Math.floor(rng() * 4) });
      break;
    }
    (side === "andar" ? andar : bahar).push(nonMatch());
    dealt++;
    side = side === "andar" ? "bahar" : "andar";
  }

  return { joker, andar, bahar, matchSide, win };
}

// ── Plinko ─────────────────────────────────────────────────────────────────
// Decide win/loss FIRST from the (already-capped) win probability, then sample a
// bucket from the profit set W (mult > 1) on a win or the loss set L (mult ≤ 1) on a
// loss, weighted by the true binomial. A deterministic L/R path with exactly
// `bucket` rights is generated for the client to animate. House safety is enforced
// upstream by plinkoMaxWinPct (the caller caps winProbabilityPct for normal players).
export function dropPlinkoWithProbability(
  serverSeed: string,
  winProbabilityPct: number,
  rows: PlinkoRows,
  risk: PlinkoRisk,
): { path: ("L" | "R")[]; bucket: number; multiplier: number } {
  const mults = PLINKO_PAYTABLE[risk][rows];
  const p = binomialWeights(rows);
  const rng = seededStream(serverSeed, "plinko");

  const win = rng() < winProbabilityPct / 100;
  // Restrict to the matching bucket set; fall back to all buckets if a set is empty.
  const set: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < mults.length; i++) {
    if ((mults[i] > 1) === win) { set.push(i); weights.push(p[i]); }
  }
  if (set.length === 0) {
    for (let i = 0; i < mults.length; i++) { set.push(i); weights.push(p[i]); }
  }
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let bucket = set[set.length - 1];
  for (let j = 0; j < set.length; j++) { r -= weights[j]; if (r <= 0) { bucket = set[j]; break; } }

  // Path: place exactly `bucket` right-bounces at random positions (partial shuffle).
  const path: ("L" | "R")[] = new Array(rows).fill("L");
  const idx = Array.from({ length: rows }, (_, i) => i);
  for (let k = 0; k < bucket; k++) {
    const j = k + Math.floor(rng() * (rows - k));
    [idx[k], idx[j]] = [idx[j], idx[k]];
    path[idx[k]] = "R";
  }

  return { path, bucket, multiplier: mults[bucket] };
}

// ── Keno ───────────────────────────────────────────────────────────────────
// Decide win/loss FIRST from the (already-capped) win probability, then pick a hit
// count from the winning set (mult > 1) on a win or the losing set on a loss,
// weighted by the true hypergeometric. The draw is then built to contain EXACTLY
// `hits` of the player's picks plus enough non-picks to total KENO_DRAW, so the
// revealed numbers are consistent with the settled hit count. House safety is
// enforced upstream by kenoMaxWinPct (the caller caps winProbabilityPct).

// Pick `count` distinct elements from `arr` via a partial Fisher-Yates shuffle.
function sampleDistinct(arr: number[], count: number, rng: () => number): number[] {
  const a = [...arr];
  const n = Math.max(0, Math.min(count, a.length));
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export function drawKenoWithProbability(
  serverSeed: string,
  winProbabilityPct: number,
  picks: number[],
): { draw: number[]; hits: number; multiplier: number } {
  const k = picks.length;
  const mults = KENO_PAYTABLE[k];
  const p = kenoHyper(k);
  const rng = seededStream(serverSeed, "keno");

  const win = rng() < winProbabilityPct / 100;
  const set: number[] = [];
  const weights: number[] = [];
  for (let h = 0; h < mults.length; h++) {
    if ((mults[h] > 1) === win) { set.push(h); weights.push(p[h]); }
  }
  if (set.length === 0) {
    for (let h = 0; h < mults.length; h++) { set.push(h); weights.push(p[h]); }
  }
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let hits = set[set.length - 1];
  for (let j = 0; j < set.length; j++) { r -= weights[j]; if (r <= 0) { hits = set[j]; break; } }

  // Build the draw: `hits` of the player's picks + (KENO_DRAW − hits) non-picks.
  const pickSet = new Set(picks);
  const nonPicks: number[] = [];
  for (let n = 1; n <= KENO_POOL; n++) if (!pickSet.has(n)) nonPicks.push(n);
  const draw = sampleDistinct(picks, hits, rng).concat(sampleDistinct(nonPicks, KENO_DRAW - hits, rng));
  // Shuffle the combined draw so hit/non-hit order looks random in the reveal.
  for (let i = draw.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [draw[i], draw[j]] = [draw[j], draw[i]];
  }

  return { draw, hits, multiplier: mults[hits] };
}

// ── Dragon vs Tiger ─────────────────────────────────────────────────────────
// Decide net-win/loss FIRST from the (portfolio-capped) win probability, then
// pick the round's winning zone from the player-favourable set W (win) or the
// rest L (loss), weighted by the natural single-deck odds, and finally deal two
// cards consistent with that zone — presentation for an already-decided outcome,
// same doctrine as Andar Bahar / Plinko / Keno. House safety is enforced
// upstream by dtMaxWinPct (the caller caps winProbabilityPct for normal players;
// see lib/games/dragon-tiger.ts). A hedged book can have an empty W — then the
// round is a forced non-positive outcome for promo players too (no net-positive
// outcome exists, EV is bounded by construction).
export function resolveDragonTigerWithProbability(
  serverSeed: string,
  winProbabilityPct: number,
  bets: DtBets,
): { winner: DtZone; dragonCard: DtCard; tigerCard: DtCard; win: boolean } {
  const rng = seededStream(serverSeed, "dragon-tiger");
  const { winSet, lossSet } = dtStats(bets);
  const roll = rng();
  const win = winSet.length > 0 && roll < winProbabilityPct / 100;
  const set = win ? winSet : lossSet.length > 0 ? lossSet : winSet;
  const winner = pickDtZoneWeighted(set, rng);
  const { dragonCard, tigerCard } = dealDtCards(winner, rng);
  return { winner, dragonCard, tigerCard, win };
}

// ── Teen Patti 20-20 ────────────────────────────────────────────────────────
// Same doctrine as Dragon vs Tiger, over a six-entry outcome space (winning side
// × which hands reached Pair+): decide net-win/loss FIRST from the portfolio-
// capped win probability, pick a target outcome from the player-favourable set W
// or the rest L weighted by natural odds, then deal hands consistent with it.
// House safety is enforced upstream by tpMaxWinPct; a hedged book can have an
// empty W, in which case the round is a forced non-positive outcome even for
// promo players (no net-positive outcome exists).
//
// `win` is taken from the CARDS ACTUALLY DEALT, not from the roll. dealTpHands
// re-derives its outcome from the hands it produced, so settlement can never
// disagree with what the player sees on the table.
export function resolveTeenPattiWithProbability(
  serverSeed: string,
  winProbabilityPct: number,
  bets: TpBets,
): TpDeal & { win: boolean } {
  const rng = seededStream(serverSeed, "teen-patti");
  const { winSet, lossSet } = tpStats(bets);
  const roll = rng();
  const intendWin = winSet.length > 0 && roll < winProbabilityPct / 100;
  const set = intendWin ? winSet : lossSet.length > 0 ? lossSet : winSet;
  const deal = dealTpHands(pickTpOutcomeWeighted(set, rng), rng);
  return { ...deal, win: winSet.includes(deal.outcome) };
}
