// ─── Shared spectator round sequence ──────────────────────────────────────────
// Skyrise rounds used to be private to each browser tab: the phase machine ran
// on local timers and spectator crashes came from Math.random(), so two devices
// opened side by side flew different planes and no round existed anywhere the
// server could see it.
//
// This module makes the *spectator* layer a pure function of wall-clock time.
// Given the same instant, every tab — and the round monitor — derives the same
// round index, the same start time and the same crash multiplier, with no
// network call and no shared state.
//
// Scope: this governs rounds nobody has money on. The moment a bet is placed,
// lib/actions/games.ts still decides that player's crash from their own bet
// amount, auto-cashout targets and win-probability tier, exactly as before —
// their round diverges from the sequence and re-joins at the next boundary.
// Tiers, promos and the house edge are untouched by anything in this file.
//
// Deliberately secret-free: the browser has to know the crash point in order to
// animate the plane crashing, so a spectator value can never be hidden from the
// client anyway. Nothing here carries financial risk — no money rides on a
// spectator round.

// These four must stay in step with the phase machine in sky-rise-game.tsx.
export const BETTING_MS = 5_000;
export const CRASH_HOLD_MS = 1_400;
export const POST_MS = 1_900;
export const FLIGHT_GROWTH = 0.15; // multiplier = e^(0.15 · seconds)

// Matches the previous local spectator behaviour: crash high enough often
// enough that the simulated bets (targets 1.2–7.2) visibly cash out.
const SPECTATOR_WIN_PROBABILITY = 60;

const DAY_MS = 86_400_000;
// Anchor for the human-facing round number only. Chosen so the badge sits in a
// believable seven-digit range for a long-running crash game.
const ROUND_NUMBER_EPOCH_DAY = Math.floor(Date.UTC(2025, 0, 1) / DAY_MS);
const ROUNDS_PER_DAY_NOMINAL = 4_800;

export interface SharedRound {
  /** Index within the UTC day. */
  index: number;
  /** Cosmetic, monotonic across days, identical on every device. */
  roundNumber: number;
  /** Wall-clock ms when this round's betting window opens. */
  startsAt: number;
  /** Wall-clock ms when the plane launches. */
  flightAt: number;
  /** Wall-clock ms when the plane crashes. */
  crashesAt: number;
  /** Wall-clock ms when the next round's betting window opens. */
  endsAt: number;
  crashAt: number;
}

// Two independent draws from one index — splitmix-style avalanche, so adjacent
// rounds share no visible structure.
function hashToUnit(a: number): number {
  let t = (a + 0x9e3779b9) | 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

export function crashForRound(dayKey: number, index: number): number {
  const seed = Math.imul(dayKey, 100003) + index;
  const wins = hashToUnit(seed * 2) < SPECTATOR_WIN_PROBABILITY / 100;
  const r = hashToUnit(seed * 2 + 1);
  // High crash: well above the simulated cashout targets, so most cash out.
  if (wins) return Number((8.0 + r * 12.0).toFixed(2));
  // Low crash: most simulated bets don't reach their target.
  return Number((1.0 + r * 1.4).toFixed(2));
}

export function flightMs(crashAt: number): number {
  return (Math.log(Math.max(1.0001, crashAt)) / FLIGHT_GROWTH) * 1000;
}

export function roundMs(crashAt: number): number {
  return BETTING_MS + flightMs(crashAt) + CRASH_HOLD_MS + POST_MS;
}

// ─── Per-day schedule ─────────────────────────────────────────────────────────
// Round length depends on its own crash point (a 20× flight runs ~20 s, a 1.1×
// flight ~0.6 s), so boundaries can't be derived with a single division — they
// have to accumulate. A whole UTC day is ~5–10k rounds, which builds in a couple
// of milliseconds and is cached, so lookups after the first are a binary search.

interface DaySchedule {
  dayKey: number;
  starts: Float64Array;
  /** ends[i] === starts[i+1]; the final entry is exactly midnight. */
  ends: Float64Array;
  crashes: Float64Array;
}

let cachedDay: DaySchedule | null = null;

function buildDay(dayKey: number): DaySchedule {
  const dayStart = dayKey * DAY_MS;
  const dayEnd = dayStart + DAY_MS;
  const starts: number[] = [];
  const crashes: number[] = [];
  let t = dayStart;
  let i = 0;
  // Stop before a round that couldn't finish inside the day. Letting one
  // overrun instead would make it overlap the next day's round 0 — every device
  // would still agree, but the plane would visibly reset mid-flight once a day.
  for (;;) {
    const crash = crashForRound(dayKey, i);
    const duration = roundMs(crash);
    if (t + duration > dayEnd) break;
    starts.push(t);
    crashes.push(crash);
    t += duration;
    i++;
  }
  // The leftover (always under one round, so at most ~28 s) is absorbed by the
  // last round's post phase, which just holds the result on screen a little
  // longer. Both the game and the monitor compute it identically, so midnight
  // passes without either one jumping.
  const ends = starts.map((_, idx) => (idx + 1 < starts.length ? starts[idx + 1] : dayEnd));
  return {
    dayKey,
    starts: Float64Array.from(starts),
    ends: Float64Array.from(ends),
    crashes: Float64Array.from(crashes),
  };
}

function scheduleFor(dayKey: number): DaySchedule {
  if (cachedDay?.dayKey === dayKey) return cachedDay;
  cachedDay = buildDay(dayKey);
  return cachedDay;
}

function toRound(day: DaySchedule, index: number): SharedRound {
  const startsAt = day.starts[index];
  const crashAt = day.crashes[index];
  const flightAt = startsAt + BETTING_MS;
  const crashesAt = flightAt + flightMs(crashAt);
  return {
    index,
    roundNumber:
      (day.dayKey - ROUND_NUMBER_EPOCH_DAY) * ROUNDS_PER_DAY_NOMINAL + index,
    startsAt,
    flightAt,
    crashesAt,
    // Read from the table rather than recomputed, so the day's last round ends
    // exactly at midnight and the sequence stays gapless across the boundary.
    endsAt: day.ends[index],
    crashAt,
  };
}

/** The round covering instant `t` (server-corrected wall clock, in ms). */
export function roundAt(t: number): SharedRound {
  const dayKey = Math.floor(t / DAY_MS);
  const day = scheduleFor(dayKey);

  // Largest index whose start is <= t.
  let lo = 0;
  let hi = day.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (day.starts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return toRound(day, lo);
}

/** The first round that begins strictly after `t`. */
export function roundAfter(t: number): SharedRound {
  const current = roundAt(t);
  const dayKey = Math.floor(current.startsAt / DAY_MS);
  const day = scheduleFor(dayKey);
  const next = current.index + 1;
  // Past the tail of this day's table, roll into the next day's round 0 — which
  // starts exactly where this one ended, at midnight.
  if (next >= day.starts.length) return roundAt(current.endsAt);
  return toRound(day, next);
}

export type SharedPhase = "betting" | "flight" | "crash" | "post";

export function phaseAt(t: number, round = roundAt(t)): SharedPhase {
  if (t < round.flightAt) return "betting";
  if (t < round.crashesAt) return "flight";
  if (t < round.crashesAt + CRASH_HOLD_MS) return "crash";
  return "post";
}
