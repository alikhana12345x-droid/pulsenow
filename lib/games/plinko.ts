// Plinko — shared config + payout math. Imported by BOTH the server (game-engine /
// action) and the client component so the two never drift. Pure (no crypto), so it's
// safe to bundle on the client.
//
// A ball drops through `rows` rows of pegs, bouncing left/right; the bucket it lands
// in = the number of right bounces (0..rows). A fair drop is binomial. Multipliers per
// bucket come from PLINKO_PAYTABLE; the paytables below all have a fair EV ≈ 0.99.

export type PlinkoRows = 8 | 12 | 16;
export type PlinkoRisk = "low" | "medium" | "high";

export const PLINKO_ROWS: PlinkoRows[] = [8, 12, 16];
export const PLINKO_RISKS: PlinkoRisk[] = ["low", "medium", "high"];
export const PLINKO_HOUSE_EDGE = 0.01;

// Verified (scripts/plinko-design): every table's fair Σ p·mult ≈ 0.99.
export const PLINKO_PAYTABLE: Record<PlinkoRisk, Record<PlinkoRows, number[]>> = {
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

export function isPlinkoRows(v: unknown): v is PlinkoRows {
  return v === 8 || v === 12 || v === 16;
}
export function isPlinkoRisk(v: unknown): v is PlinkoRisk {
  return v === "low" || v === "medium" || v === "high";
}

// Binomial landing probabilities p_i = C(n,i) / 2^n, summing to 1.
export function binomialWeights(n: number): number[] {
  const w: number[] = [];
  let c = 1;
  for (let k = 0; k <= n; k++) { w.push(c); c = (c * (n - k)) / (k + 1); }
  const tot = Math.pow(2, n);
  return w.map((x) => x / tot);
}

export function plinkoMultipliers(rows: PlinkoRows, risk: PlinkoRisk): number[] {
  return PLINKO_PAYTABLE[risk][rows];
}

export function plinkoMaxMultiplier(rows: PlinkoRows, risk: PlinkoRisk): number {
  return Math.max(...PLINKO_PAYTABLE[risk][rows]);
}

// The highest win probability a NORMAL player may have for this config without the
// house losing. Profit buckets (mult > 1) form set W, the rest set L. With a win round
// landing in W and a loss round in L, EV = q·A + (1−q)·B where A = E[mult|W],
// B = E[mult|L]. Solving EV ≤ 1−edge gives qMax = (1−edge−B)/(A−B). Returns 0..100.
//
// (This is tighter and *more correct* than capping against the max bucket, which
// ignores the positive contribution of the sub-1× loss buckets.)
// Conditional mean multipliers: A = E[mult | win bucket], B = E[mult | loss bucket].
function plinkoConditionalMeans(rows: PlinkoRows, risk: PlinkoRisk): { A: number; B: number } {
  const mults = PLINKO_PAYTABLE[risk][rows];
  const p = binomialWeights(rows);
  let PW = 0, PL = 0, sumW = 0, sumL = 0;
  for (let i = 0; i < mults.length; i++) {
    if (mults[i] > 1) { PW += p[i]; sumW += p[i] * mults[i]; }
    else { PL += p[i]; sumL += p[i] * mults[i]; }
  }
  return { A: PW > 0 ? sumW / PW : 0, B: PL > 0 ? sumL / PL : 0 };
}

export function plinkoMaxWinPct(rows: PlinkoRows, risk: PlinkoRisk, edge = PLINKO_HOUSE_EDGE): number {
  const { A, B } = plinkoConditionalMeans(rows, risk);
  if (A <= B) return 0;
  return Math.max(0, Math.min(1, (1 - edge - B) / (A - B))) * 100;
}

// Exact theoretical RTP for a round played at effective win probability qPct:
// EV = q·E[mult|win] + (1−q)·E[mult|loss]. Snapshotted per round for reports.
export function plinkoExpectedRtp(rows: PlinkoRows, risk: PlinkoRisk, qPct: number): number {
  const { A, B } = plinkoConditionalMeans(rows, risk);
  const q = Math.max(0, Math.min(1, qPct / 100));
  return q * A + (1 - q) * B;
}
