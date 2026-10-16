// Monte-Carlo verification for the Dragon vs Tiger engine.
// Usage: npx tsx scripts/dragon-tiger-sim.ts
//
// Asserts, per portfolio × tier × promo flag:
//   1. cards are always consistent with the winner (win = strict rank order; tie = same rank, different suits)
//   2. the engine's `win` flag ⇔ the payout is strictly net-positive
//   3. observed win rate tracks the effective (capped) probability
//   4. observed RTP tracks dtExpectedRtp and, for non-promo, never beats 1 − DT_HOUSE_EDGE
//   5. the documented qMax worked examples hold

import crypto from "crypto";
import { resolveDragonTigerWithProbability } from "../lib/game-engine";
import {
  dtMaxWinPct, dtExpectedRtp, dtReturn, dtTotal, dtStats,
  DT_HOUSE_EDGE, type DtBets,
} from "../lib/games/dragon-tiger";

const N = 60_000;
const TIERS = [5, 20, 35, 60, 95];

const PORTFOLIOS: Array<{ name: string; bets: DtBets }> = [
  { name: "100 dragon",           bets: { dragon: 100, tie: 0,   tiger: 0 } },
  { name: "100 tiger",            bets: { dragon: 0,   tie: 0,   tiger: 100 } },
  { name: "100 tie",              bets: { dragon: 0,   tie: 100, tiger: 0 } },
  { name: "100 D + 20 tie",       bets: { dragon: 100, tie: 20,  tiger: 0 } },
  { name: "hedge 100 D + 100 T",  bets: { dragon: 100, tie: 0,   tiger: 100 } },
  { name: "100 D + 25 tie + 100 T", bets: { dragon: 100, tie: 25, tiger: 100 } },
  { name: "500 D + 50 T",         bets: { dragon: 500, tie: 0,   tiger: 50 } },
];

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
}

// ── 1. qMax worked examples (spec §5 table) ──────────────────────────────────
console.log("qMax worked examples:");
const ex = (bets: DtBets) => dtMaxWinPct(bets);
check(Math.abs(ex({ dragon: 100, tie: 0, tiger: 0 }) - 47.5) < 1e-9, "100 dragon qMax should be 47.5");
check(Math.abs(ex({ dragon: 0, tie: 100, tiger: 0 }) - (0.95 / 9) * 100) < 1e-9, "100 tie qMax should be 10.5556");
check(ex({ dragon: 100, tie: 0, tiger: 100 }) === 0, "perfect hedge qMax should be 0");
const mixed = ex({ dragon: 100, tie: 20, tiger: 0 });
check(mixed > 57 && mixed < 58.5, `100D+20tie qMax ≈ 57.6 (got ${mixed.toFixed(2)})`);
console.log(`  100D→47.5 · 100Tie→${ex({ dragon: 0, tie: 100, tiger: 0 }).toFixed(2)} · 100D+20Tie→${mixed.toFixed(2)} · hedge→0  ✓\n`);

// ── 2. Monte-Carlo over portfolios × tiers ───────────────────────────────────
console.log(`Monte-Carlo: ${PORTFOLIOS.length} portfolios × ${TIERS.length} tiers × ${N.toLocaleString()} rounds (+promo pass at 60%)\n`);
console.log("portfolio                   | tier  | promo | effPct | winRate | rtp     | expRtp  | maxRtp");
console.log("----------------------------+-------+-------+--------+---------+---------+---------+-------");

for (const { name, bets } of PORTFOLIOS) {
  const S = dtTotal(bets);
  const { winSet } = dtStats(bets);
  for (const tier of TIERS) {
    for (const isPromo of tier === 60 ? [false, true] : [false]) {
      const effective = isPromo ? tier : Math.min(tier, dtMaxWinPct(bets));
      let wins = 0;
      let returned = 0;
      for (let i = 0; i < N; i++) {
        const seed = crypto.randomBytes(16).toString("hex");
        const r = resolveDragonTigerWithProbability(seed, effective, bets);
        const pay = dtReturn(bets, r.winner);
        returned += pay;
        if (r.win) wins++;

        // Card/winner consistency (every round).
        const { dragonCard: d, tigerCard: t } = r;
        if (r.winner === "dragon") check(d.rank > t.rank, `${name}: dragon win but ranks ${d.rank}≤${t.rank}`);
        else if (r.winner === "tiger") check(t.rank > d.rank, `${name}: tiger win but ranks ${t.rank}≤${d.rank}`);
        else check(d.rank === t.rank && d.suit !== t.suit, `${name}: tie cards inconsistent (${d.rank}/${d.suit} vs ${t.rank}/${t.suit})`);

        // win flag ⇔ strictly net-positive payout.
        check(r.win === pay > S, `${name}: win flag ${r.win} but payout ${pay} vs stake ${S}`);
        if (failures > 25) { console.error("too many failures — aborting"); process.exit(1); }
      }
      const winRate = (wins / N) * 100;
      const rtp = returned / (N * S);
      const expRtp = dtExpectedRtp(bets, effective);

      // Win rate tracks effective% (only meaningful when a win set exists).
      if (winSet.length > 0) {
        const sigma = Math.sqrt((effective / 100) * (1 - effective / 100) / N) * 100;
        check(Math.abs(winRate - effective) < Math.max(0.35, 4 * sigma), `${name} tier ${tier}${isPromo ? " promo" : ""}: winRate ${winRate.toFixed(2)} vs effective ${effective.toFixed(2)}`);
      } else {
        check(wins === 0, `${name}: hedge produced win rounds`);
      }
      // RTP tracks the analytic EV.
      check(Math.abs(rtp - expRtp) < 0.05, `${name} tier ${tier}${isPromo ? " promo" : ""}: rtp ${rtp.toFixed(4)} vs expected ${expRtp.toFixed(4)}`);
      // Non-promo: the analytic EV itself must respect the edge.
      if (!isPromo) check(expRtp <= 1 - DT_HOUSE_EDGE + 1e-9, `${name} tier ${tier}: expectedRtp ${expRtp.toFixed(4)} beats the ${DT_HOUSE_EDGE} edge`);

      console.log(
        `${name.padEnd(27)} | ${String(tier).padStart(4)}% | ${isPromo ? "  yes" : "   no"} | ${effective.toFixed(2).padStart(6)} | ${winRate.toFixed(2).padStart(6)}% | ${rtp.toFixed(4).padStart(7)} | ${expRtp.toFixed(4).padStart(7)} | ${(1 - DT_HOUSE_EDGE).toFixed(2)}`,
      );
    }
  }
}

console.log(failures === 0 ? "\n✓ ALL CHECKS PASSED" : `\n✗ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
