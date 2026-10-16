// Dragon vs Tiger — shared config + portfolio payout math. Imported by BOTH the
// server (game-engine / action) and the client (round loop, bet zones, spectator
// rounds) so the two never drift. Pure — no crypto or server-only imports.
//
// One card is dealt to Dragon, one to Tiger; higher rank wins (A low → K high),
// same rank = Tie. Players may stake any combination of the three zones, so a
// round settles a PORTFOLIO — a "losing" outcome can still return money (e.g.
// dragon+tiger hedge). House safety therefore uses the qMax portfolio cap (same
// correction as Plinko/Keno), not the single-multiplier cap.

export const DT_BETTING_SECONDS = 15;
export const DT_FREE_SECONDS = 8;
// Bets lock this long before the flip; the round request is prefetched in this
// window (SkyRise pattern) so cards flip the instant the countdown empties.
// 1.5s (up from 1.0) absorbs slow first-byte times so the "Dealing…" hold stays rare.
export const DT_BETS_LOCK_SECONDS = 1.5;

export const DT_HOUSE_EDGE = 0.05;
export const DT_MIN_TOTAL = 10;     // also the per-zone minimum (smallest chip)
export const DT_MAX_TOTAL = 20000;
export const DT_CHIP_VALUES = [10, 50, 100, 500, 1000, 5000, 10000] as const;

export const DT_ZONES = ["dragon", "tie", "tiger"] as const; // display order
export type DtZone = (typeof DT_ZONES)[number];
export type DtBets = Record<DtZone, number>;
// rank 0..12 = A(low)..K(high) — matches the shared PlayingCard indexing.
export type DtCard = { rank: number; suit: number };

// Total-return multiples: 1:1 pays back 2× the stake, 8:1 pays back 9×.
export const DT_PAYOUT: Record<DtZone, number> = { dragon: 2, tie: 9, tiger: 2 };

// Natural single-deck odds for two cards drawn without replacement:
// P(same rank) = 3/51; Dragon and Tiger split the remainder evenly.
export const DT_NATURAL: Record<DtZone, number> = {
  dragon: 24 / 51,
  tie: 3 / 51,
  tiger: 24 / 51,
};

export function isDtZone(v: unknown): v is DtZone {
  return v === "dragon" || v === "tie" || v === "tiger";
}

export function emptyDtBets(): DtBets {
  return { dragon: 0, tie: 0, tiger: 0 };
}

export function dtTotal(bets: DtBets): number {
  return bets.dragon + bets.tie + bets.tiger;
}

// Server-side validation of the client payload. Returns a clean DtBets or null.
// Every staked zone must be an integer ≥ the smallest chip; round total 10–20,000.
export function normalizeDtBets(input: unknown): DtBets | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  const bets = emptyDtBets();
  for (const zone of DT_ZONES) {
    const v = raw[zone];
    if (v == null) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) return null;
    if (v > 0 && v < DT_MIN_TOTAL) return null;
    bets[zone] = v;
  }
  const total = dtTotal(bets);
  if (total < DT_MIN_TOTAL || total > DT_MAX_TOTAL) return null;
  return bets;
}

// Total money returned to the player when `winner` is the round outcome.
export function dtReturn(bets: DtBets, winner: DtZone): number {
  return bets[winner] * DT_PAYOUT[winner];
}

// Portfolio classification. W = outcomes strictly net-positive for the player;
// L = the rest (break-even counts as loss — safety). A / B are the expected
// per-unit returns conditional on landing in W / L, weighted by natural odds.
export function dtStats(bets: DtBets): { winSet: DtZone[]; lossSet: DtZone[]; A: number; B: number } {
  const S = dtTotal(bets);
  const winSet: DtZone[] = [];
  const lossSet: DtZone[] = [];
  let wp = 0, wa = 0, lp = 0, la = 0;
  for (const zone of DT_ZONES) {
    const r = S > 0 ? dtReturn(bets, zone) / S : 0;
    const p = DT_NATURAL[zone];
    if (r > 1 + 1e-9) { winSet.push(zone); wp += p; wa += p * r; }
    else { lossSet.push(zone); lp += p; la += p * r; }
  }
  return { winSet, lossSet, A: wp > 0 ? wa / wp : 0, B: lp > 0 ? la / lp : 0 };
}

// The house-never-loses ceiling for this portfolio: EV(q) = q·A + (1−q)·B must
// stay ≤ 1 − edge, so qMax = (1 − edge − B) / (A − B). Examples at the 5% edge:
// 100 on dragon → 47.5%; 100 on tie → 10.56%; a dragon+tiger hedge → 0 (W empty,
// EV ≈ 0.941 regardless, edge still holds).
export function dtMaxWinPct(bets: DtBets): number {
  const { winSet, A, B } = dtStats(bets);
  if (winSet.length === 0 || A <= B) return 0;
  const q = (1 - DT_HOUSE_EDGE - B) / (A - B);
  return Math.max(0, Math.min(1, q)) * 100;
}

// Theoretical EV per unit staked at the given (already-capped) win probability —
// snapshotted onto the round as expected_rtp. With an empty win set (a full
// hedge) the engine forces a loss-set outcome regardless of the configured pct
// (even for promo players — no net-positive outcome exists), so q is 0 there.
export function dtExpectedRtp(bets: DtBets, effectivePct: number): number {
  const { winSet, A, B } = dtStats(bets);
  const q = winSet.length === 0 ? 0 : effectivePct / 100;
  return q * A + (1 - q) * B;
}

// Sample a zone from `set`, weighted by the natural odds (renormalised).
export function pickDtZoneWeighted(set: DtZone[], rng: () => number): DtZone {
  const total = set.reduce((s, z) => s + DT_NATURAL[z], 0);
  let r = rng() * total;
  for (const zone of set) {
    r -= DT_NATURAL[zone];
    if (r <= 0) return zone;
  }
  return set[set.length - 1];
}

// Deal two cards consistent with the decided winner. Non-tie: uniform over the
// 78 ordered rank pairs (hi > lo), suits uniform. Tie: one rank, distinct suits.
export function dealDtCards(winner: DtZone, rng: () => number): { dragonCard: DtCard; tigerCard: DtCard } {
  if (winner === "tie") {
    const rank = Math.floor(rng() * 13);
    const s1 = Math.floor(rng() * 4);
    const s2 = (s1 + 1 + Math.floor(rng() * 3)) % 4; // guaranteed different suit
    return { dragonCard: { rank, suit: s1 }, tigerCard: { rank, suit: s2 } };
  }
  // Uniform pair index → (lo, hi): lo has (12 − lo) partners above it.
  let k = Math.floor(rng() * 78);
  let lo = 0;
  while (k >= 12 - lo) { k -= 12 - lo; lo++; }
  const hi = lo + 1 + k;
  const hiCard: DtCard = { rank: hi, suit: Math.floor(rng() * 4) };
  const loCard: DtCard = { rank: lo, suit: Math.floor(rng() * 4) };
  return winner === "dragon"
    ? { dragonCard: hiCard, tigerCard: loCard }
    : { dragonCard: loCard, tigerCard: hiCard };
}

// Spectator rounds (no player stake): raw natural odds, no server involved.
export function sampleNaturalDtOutcome(rng: () => number): { winner: DtZone; dragonCard: DtCard; tigerCard: DtCard } {
  const winner = pickDtZoneWeighted([...DT_ZONES], rng);
  return { winner, ...dealDtCards(winner, rng) };
}
