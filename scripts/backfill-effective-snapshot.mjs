// One-off backfill for migration 0008: reconstructs effective_win_probability,
// expected_rtp, and is_win_round for historical game_rounds where the values are
// exactly derivable from stored data. Uses the SAME cap math the engine applied
// at the time the rounds were played (Skyrise uses the OLD pre-rework caps,
// since that is what generated those rounds). Hi-lo is skipped (no round-level
// effective % exists). Idempotent: only touches rows with NULL snapshot columns.
import pkg from "@next/env";
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import postgres from "postgres";

const url = process.env.DB_URL;
if (!url) { console.error("DB_URL not set"); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });

// ── math mirrors lib/games/plinko.ts + keno.ts + game-engine.ts ──────────────
const PLINKO_PAYTABLE = {
  low: {
    8: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    12: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  },
  medium: {
    8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  },
  high: {
    8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    12: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};
const KENO_PAYTABLE = {
  1: [0, 3.9], 2: [0, 0, 17], 3: [0, 0, 2.7, 50], 4: [0, 0, 1.8, 11, 69],
  5: [0, 0, 0, 4.8, 45, 415], 6: [0, 0, 0, 2.9, 16, 92, 520],
  7: [0, 0, 0, 0, 9.4, 64, 430, 1000], 8: [0, 0, 0, 0, 5.7, 27, 130, 615, 1000],
  9: [0, 0, 0, 0, 3.8, 14, 52, 190, 700, 1000],
  10: [0, 0, 0, 0, 0, 12, 47, 180, 680, 1000, 1000],
};
function binomialWeights(n) {
  const w = []; let c = 1;
  for (let k = 0; k <= n; k++) { w.push(c); c = (c * (n - k)) / (k + 1); }
  const tot = Math.pow(2, n);
  return w.map((x) => x / tot);
}
function comb(n, r) {
  if (r < 0 || r > n) return 0;
  r = Math.min(r, n - r);
  let c = 1;
  for (let i = 0; i < r; i++) c = (c * (n - i)) / (i + 1);
  return c;
}
function kenoHyper(k) {
  const tot = comb(40, 10);
  const p = [];
  for (let h = 0; h <= k; h++) p.push((comb(k, h) * comb(40 - k, 10 - h)) / tot);
  return p;
}
function condMeans(mults, p) {
  let PW = 0, PL = 0, sumW = 0, sumL = 0;
  for (let i = 0; i < mults.length; i++) {
    if (mults[i] > 1) { PW += p[i]; sumW += p[i] * mults[i]; }
    else { PL += p[i]; sumL += p[i] * mults[i]; }
  }
  return { A: PW > 0 ? sumW / PW : 0, B: PL > 0 ? sumL / PL : 0 };
}
function maxWinPct(mults, p, edge) {
  const { A, B } = condMeans(mults, p);
  if (A <= B) return 0;
  return Math.max(0, Math.min(1, (1 - edge - B) / (A - B))) * 100;
}
function expectedRtp(mults, p, qPct) {
  const { A, B } = condMeans(mults, p);
  const q = Math.max(0, Math.min(1, qPct / 100));
  return q * A + (1 - q) * B;
}
const cap = (pct, mult, edge) => mult <= 0 ? 0 : Math.max(0, Math.min(pct, ((1 - edge) * 100) / mult));

// ── backfill ──────────────────────────────────────────────────────────────────
const rows = await sql`
  SELECT gr.id, gr.game_type, gr.win_probability::float AS q, gr.is_promo,
         gr.is_win_round, gr.multiplier::float AS mult, gr.outcome,
         COALESCE((SELECT MAX(b.payout::float) FROM bets b WHERE b.round_id = gr.id), 0) AS max_payout
  FROM game_rounds gr
  WHERE gr.effective_win_probability IS NULL
    AND gr.win_probability IS NOT NULL
    AND gr.game_type <> 'hi-lo'`;

let updated = 0, skipped = 0;
for (const r of rows) {
  const q = Number(r.q);
  const promo = r.is_promo;
  let eff = null, exp = null, isWin = r.is_win_round;
  const wonByPayout = Number(r.max_payout) > 0;

  switch (r.game_type) {
    case "mines":
      eff = q; exp = 0.95 * q / 100; break;
    case "dragon-tower":
      eff = q; exp = 0.99 * q / 100; break;
    case "dice":
      if (!r.mult) { skipped++; continue; }
      eff = promo ? q : cap(q, r.mult, 0.20); exp = (eff / 100) * r.mult;
      if (isWin == null) isWin = wonByPayout;
      break;
    case "limbo":
      if (!r.mult) { skipped++; continue; }
      eff = promo ? q : cap(q, r.mult, 0.20); exp = (eff / 100) * r.mult;
      if (isWin == null) isWin = wonByPayout;
      break;
    case "coinflip":
      eff = promo ? q : cap(q, 1.96, 0.02); exp = (eff / 100) * 1.96;
      if (isWin == null) isWin = wonByPayout;
      break;
    case "andar-bahar":
      eff = promo ? q : cap(q, 1.96, 0.02); exp = (eff / 100) * 1.96;
      if (isWin == null) isWin = wonByPayout;
      break;
    case "keno": {
      const k = Array.isArray(r.outcome?.picks) ? r.outcome.picks.length : null;
      if (!k || !KENO_PAYTABLE[k]) { skipped++; continue; }
      const p = kenoHyper(k), mults = KENO_PAYTABLE[k];
      eff = promo ? q : Math.min(q, maxWinPct(mults, p, 0.01));
      exp = expectedRtp(mults, p, eff);
      if (isWin == null) isWin = wonByPayout;
      break;
    }
    case "plinko": {
      const { rows: pr, risk } = r.outcome ?? {};
      const mults = PLINKO_PAYTABLE[risk]?.[pr];
      if (!mults) { skipped++; continue; }
      const p = binomialWeights(pr);
      eff = promo ? q : Math.min(q, maxWinPct(mults, p, 0.01));
      exp = expectedRtp(mults, p, eff);
      if (isWin == null) isWin = Number(r.mult) > 1;
      break;
    }
    case "skyrise": {
      // OLD engine logic (these rounds predate the rework)
      const betsArr = Array.isArray(r.outcome?.bets) ? r.outcome.bets : [];
      const targets = betsArr.map((b) => b?.autoCashoutAt).filter((t) => typeof t === "number" && t > 1.0 && t <= 100);
      const crashAt = Number(r.outcome?.crashAt ?? r.mult ?? 0);
      if (targets.length > 0) {
        const maxT = Math.max(...targets);
        eff = promo ? q : cap(q, maxT, 0.03);
        exp = (eff / 100) * maxT;
        if (isWin == null) isWin = crashAt > maxT;
      } else {
        eff = promo ? q : cap(q, 10, 0.03);
        exp = (eff / 100) * 6; // mean of the old 2–10× win range
        if (isWin == null) isWin = crashAt >= 2;
      }
      break;
    }
    default:
      skipped++; continue;
  }

  await sql`
    UPDATE game_rounds
    SET effective_win_probability = ${eff.toFixed(2)},
        expected_rtp = ${exp.toFixed(4)},
        is_win_round = ${isWin}
    WHERE id = ${r.id}`;
  updated++;
}

console.log(`Backfilled ${updated} rounds, skipped ${skipped} (of ${rows.length} candidates).`);
await sql.end();
