// Verification harness for lib/games/teen-patti.ts. The repo has no test runner,
// so correctness lives here — run it after any change to the module.
//
//   npx tsx scripts/verify-teen-patti.ts [samples]
//
// Checks, in order:
//   1. hand ranking, incl. the A-2-3 sequence trap
//   2. TP_NATURAL matches a fresh simulation driven by the module's own scorer
//   3. THE house-never-loses guarantee across a grid of bet portfolios
//   4. dealTpHands actually lands the outcome it was asked for, and leaks no ties
//   5. the dealer preserves the natural hand distribution (the "cards survive
//      inspection" claim behind the deal-then-orient trick)

import { randomBytes } from "crypto";
import { resolveTeenPattiWithProbability } from "../lib/game-engine";
import {
  TP_CAT, TP_HOUSE_EDGE, TP_NATURAL, TP_OUTCOMES, TP_ZONES, tpReturn,
  type TpBets, type TpCard, type TpHand, type TpOutcomeKey,
  compareTpHands, dealTpHands, emptyTpBets, isTpPairPlus, sampleNaturalTpOutcome,
  scoreTpHand, tpExpectedRtp, tpMaxWinPct, tpStats,
} from "../lib/games/teen-patti";

const N = Number(process.argv[2] || 2_000_000);
const rng = () => Math.random();

let failures = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

// rank index 0..12 = A..K ; suit 0..3
const C = (rank: number, suit: number): TpCard => ({ rank, suit });
const H = (a: TpCard, b: TpCard, c: TpCard): TpHand => [a, b, c];
const A = 0, J = 10, Q = 11, K = 12;
const n = (v: number) => v - 1; // pip value → rank index (2 → 1, 10 → 9)

// ── 1. hand ranking ──────────────────────────────────────────────────────────
console.log("\n1. hand ranking");

const AKQ_off = H(C(A, 0), C(K, 1), C(Q, 2));
const A23_off = H(C(A, 0), C(n(2), 1), C(n(3), 2));
const KQJ_off = H(C(K, 0), C(Q, 1), C(J, 2));
const _432_off = H(C(n(4), 0), C(n(3), 1), C(n(2), 2));
const A23_suited = H(C(A, 3), C(n(2), 3), C(n(3), 3));
const trail_2 = H(C(n(2), 0), C(n(2), 1), C(n(2), 2));
const colour_AK9 = H(C(A, 1), C(K, 1), C(n(9), 1));
const pair_K_A = H(C(K, 0), C(K, 1), C(A, 2));   // pair of K, ace kicker
const pair_K_2 = H(C(K, 0), C(K, 1), C(n(2), 2));
const high_AK9 = H(C(A, 0), C(K, 1), C(n(9), 2));

ok("A-K-Q is a Sequence", scoreTpHand(AKQ_off)[0] === TP_CAT.SEQUENCE);
ok("A-2-3 is a Sequence", scoreTpHand(A23_off)[0] === TP_CAT.SEQUENCE);
ok("A-2-3 suited is a Pure Sequence", scoreTpHand(A23_suited)[0] === TP_CAT.PURE_SEQUENCE);
ok("A-K-Q beats A-2-3", compareTpHands(scoreTpHand(AKQ_off), scoreTpHand(A23_off)) > 0);
ok("A-2-3 beats K-Q-J  (THE trap)", compareTpHands(scoreTpHand(A23_off), scoreTpHand(KQJ_off)) > 0,
  "A-2-3 is the second-highest sequence, not the lowest");
ok("K-Q-J beats 4-3-2", compareTpHands(scoreTpHand(KQJ_off), scoreTpHand(_432_off)) > 0);
ok("Trail beats Pure Sequence", compareTpHands(scoreTpHand(trail_2), scoreTpHand(A23_suited)) > 0);
ok("Pure Sequence beats Sequence", compareTpHands(scoreTpHand(A23_suited), scoreTpHand(AKQ_off)) > 0);
ok("Sequence beats Colour", compareTpHands(scoreTpHand(_432_off), scoreTpHand(colour_AK9)) > 0);
ok("Colour beats Pair", compareTpHands(scoreTpHand(colour_AK9), scoreTpHand(pair_K_A)) > 0);
ok("Pair beats High Card", compareTpHands(scoreTpHand(pair_K_A), scoreTpHand(high_AK9)) > 0);
ok("Pair kicker breaks ties", compareTpHands(scoreTpHand(pair_K_A), scoreTpHand(pair_K_2)) > 0);
ok("identical hands tie", compareTpHands(scoreTpHand(high_AK9), scoreTpHand(H(C(A, 3), C(K, 2), C(n(9), 1)))) === 0);
ok("Pair+ flag: pair yes, high card no", isTpPairPlus(scoreTpHand(pair_K_A)) && !isTpPairPlus(scoreTpHand(high_AK9)));

// ── 2. TP_NATURAL vs a fresh simulation ──────────────────────────────────────
console.log(`\n2. TP_NATURAL vs ${N.toLocaleString()} simulated rounds`);

const seen: Record<string, number> = Object.fromEntries(TP_OUTCOMES.map((k) => [k, 0]));
const natCat = new Array(6).fill(0);
for (let i = 0; i < N; i++) {
  const d = sampleNaturalTpOutcome(rng);
  seen[d.outcome]++;
  natCat[d.scoreA[0]]++;
}
for (const key of TP_OUTCOMES) {
  const got = seen[key] / N;
  const want = TP_NATURAL[key];
  const drift = Math.abs(got - want);
  ok(`${key.padEnd(7)} ${(got * 100).toFixed(4)}% vs ${(want * 100).toFixed(4)}%`, drift < 0.0015,
    `drift ${(drift * 100).toFixed(4)}pp`);
}
const natSum = TP_OUTCOMES.reduce((s, k) => s + TP_NATURAL[k], 0);
ok("TP_NATURAL sums to 1", Math.abs(natSum - 1) < 1e-9, `= ${natSum}`);

// ── 3. house never loses ─────────────────────────────────────────────────────
console.log("\n3. house-never-loses cap (the guarantee)");

const bet = (o: Partial<TpBets>): TpBets => ({ ...emptyTpBets(), ...o });
const PORTFOLIOS: Array<[string, TpBets]> = [
  ["player-a alone", bet({ "player-a": 100 })],
  ["player-b alone", bet({ "player-b": 100 })],
  ["pp-a alone", bet({ "pp-a": 100 })],
  ["pp-b alone", bet({ "pp-b": 100 })],
  ["a + pp-a", bet({ "player-a": 100, "pp-a": 100 })],
  ["a + pp-b", bet({ "player-a": 100, "pp-b": 100 })],
  ["a + b hedge", bet({ "player-a": 100, "player-b": 100 })],
  ["pp-a + pp-b", bet({ "pp-a": 100, "pp-b": 100 })],
  ["all four", bet({ "player-a": 100, "player-b": 100, "pp-a": 100, "pp-b": 100 })],
  ["lopsided a", bet({ "player-a": 19000, "pp-b": 10 })],
  ["min stake", bet({ "player-a": 10 })],
];

// Two different invariants, and conflating them is a mistake:
//   • ALWAYS: RTP ≤ 1 — the house never loses. This is the hard guarantee.
//   • WHEN THE BOOK ALLOWS IT (win set non-empty): RTP ≤ 1 − edge, the target hold.
// A fully hedged book pays the same on every outcome, so no choice of outcome can
// move its RTP — the cap has nothing to steer and the hold is whatever the payout
// arithmetic fixes it at. That is still a guaranteed house profit, just a thinner
// one. See the TP_PAYOUT note in the module.
const CEIL = 1 - TP_HOUSE_EDGE + 1e-9;
for (const [label, bets] of PORTFOLIOS) {
  const qMax = tpMaxWinPct(bets);
  const rtp = tpExpectedRtp(bets, qMax);
  const { winSet } = tpStats(bets);
  const hedged = winSet.length === 0;
  ok(`${label.padEnd(16)} qMax ${qMax.toFixed(2).padStart(6)}%  → RTP ${rtp.toFixed(6)}`,
    hedged ? rtp < 1 : rtp <= CEIL,
    hedged ? `(hedged: win set empty, hold ${((1 - rtp) * 100).toFixed(2)}%)` : "");
}
// An uncapped promo probability must be the ONLY way the house can bleed.
const promoBets = bet({ "player-a": 100 });
ok("promo (uncapped 90%) does exceed the ceiling, by design",
  tpExpectedRtp(promoBets, 90) > CEIL, `RTP ${tpExpectedRtp(promoBets, 90).toFixed(4)}`);

// ── 4. dealTpHands hits its target ───────────────────────────────────────────
console.log("\n4. dealTpHands lands the requested outcome");

const DEALS = 20_000;
for (const target of TP_OUTCOMES) {
  let hit = 0, ties = 0, wrongWinner = 0;
  for (let i = 0; i < DEALS; i++) {
    const d = dealTpHands(target, rng);
    if (d.outcome === target) hit++;
    if (compareTpHands(d.scoreA, d.scoreB) === 0) ties++;
    const aWon = compareTpHands(d.scoreA, d.scoreB) > 0;
    if (aWon !== (target.startsWith("a-"))) wrongWinner++;
  }
  ok(`${target.padEnd(7)} hit ${((hit / DEALS) * 100).toFixed(2)}%  ties ${ties}  wrong-winner ${wrongWinner}`,
    hit === DEALS && ties === 0 && wrongWinner === 0);
}

// ── 5. the dealer doesn't distort the hand distribution ──────────────────────
console.log("\n5. dealt hands keep the natural category distribution");

const dealtCat = new Array(6).fill(0);
const SHAPE_DEALS = 200_000;
for (let i = 0; i < SHAPE_DEALS; i++) {
  // Sample a target the way the engine does — natural odds over the full set —
  // then check the resulting hands look like an untouched deal.
  const key = TP_OUTCOMES[
    (() => { const r = rng(); let acc = 0;
      for (let k = 0; k < TP_OUTCOMES.length; k++) { acc += TP_NATURAL[TP_OUTCOMES[k]]; if (r <= acc) return k; }
      return TP_OUTCOMES.length - 1; })()
  ] as TpOutcomeKey;
  const d = dealTpHands(key, rng);
  dealtCat[d.scoreA[0]]++;
}
const names = ["High Card", "Pair", "Colour", "Sequence", "Pure Seq", "Trail"];
for (let c = 5; c >= 0; c--) {
  const natural = natCat[c] / N;
  const dealt = dealtCat[c] / SHAPE_DEALS;
  const drift = Math.abs(natural - dealt);
  ok(`${names[c].padEnd(10)} natural ${(natural * 100).toFixed(3)}%  dealt ${(dealt * 100).toFixed(3)}%`,
    drift < 0.004, `drift ${(drift * 100).toFixed(3)}pp`);
}

// ── 6. end-to-end: the real resolver + the real payout ──────────────────────
// Everything above tests the math in isolation. This runs rounds through
// resolveTeenPattiWithProbability (the function the action calls) and settles
// them with tpReturn (the function the action pays from), so any drift between
// the engine and the portfolio math shows up as a house edge that doesn't match.
console.log("\n6. end-to-end resolver + settlement");

const E2E = 200_000;
for (const [label, bets] of PORTFOLIOS) {
  const stake = TP_ZONES.reduce((s, z) => s + bets[z], 0);
  const capped = tpMaxWinPct(bets);
  const effective = Math.min(20, capped); // DEFAULT_WIN_PROBABILITY = 20
  let returned = 0;
  for (let i = 0; i < E2E; i++) {
    const deal = resolveTeenPattiWithProbability(randomBytes(16).toString("hex"), effective, bets);
    returned += tpReturn(bets, deal.outcome);
  }
  const actualRtp = returned / (stake * E2E);
  const predicted = tpExpectedRtp(bets, effective);
  ok(`${label.padEnd(16)} RTP actual ${actualRtp.toFixed(4)} vs predicted ${predicted.toFixed(4)}`,
    Math.abs(actualRtp - predicted) < 0.02 && actualRtp < 1,
    `hold ${((1 - actualRtp) * 100).toFixed(2)}%`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
