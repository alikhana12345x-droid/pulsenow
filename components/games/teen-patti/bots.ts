// Teen Patti 20-20 — fake-multiplayer simulation. Deterministic per seed (same
// technique as SkyRise's live-bets roster and Dragon vs Tiger's) and PURE
// COSMETICS: bots never touch the server or the player's odds. They exist so the
// table feels alive — chips raining onto zones, side rosters with drifting
// balances, a live players list.

import { TP_ZONES, type TpZone, type TpBets, emptyTpBets } from "@/lib/games/teen-patti";

export interface TpBot {
  id: number;
  name: string;
  avatarIdx: number; // 0..11 → /games/dragon-tiger/avatar-pack/{idx+1}.webp (shared)
  balance: number;
}

export interface TpBotEvent {
  at: number;      // seconds into the betting window
  botIdx: number;
  zone: TpZone;
  amount: number;
}

export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rng() {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// The reference tables mix a few real-looking names into a sea of Guest######.
const NAMES = [
  "Chandra", "Ahmed", "Bilal", "Usman", "Zain", "Farhan", "Imran", "Raza",
  "Kashif", "Hamza", "Talha", "Saad", "Ayesha", "Zara", "Hira", "Sana",
  "Junaid", "Waqas", "Danish", "Noman", "Rizwan", "Haider", "Umair", "Mohsin",
];

function botName(rng: () => number): string {
  if (rng() < 0.7) {
    const digits = 5 + Math.floor(rng() * 3); // Guest + 5–7 digits
    let n = "";
    for (let i = 0; i < digits; i++) n += Math.floor(rng() * 10);
    return `Guest${n}`;
  }
  return NAMES[Math.floor(rng() * NAMES.length)];
}

// Session roster: 24–48 bots with weighted balances (most mid, a few whales).
export function makeRoster(seed: number): TpBot[] {
  const rng = mulberry32(seed);
  const count = 24 + Math.floor(rng() * 25);
  return Array.from({ length: count }, (_, i) => {
    const r = rng();
    const balance =
      r < 0.45 ? 1_000 + rng() * 8_000 :
      r < 0.80 ? 9_000 + rng() * 30_000 :
      r < 0.95 ? 40_000 + rng() * 50_000 :
                 90_000 + rng() * 60_000;
    return {
      id: i,
      name: botName(rng),
      avatarIdx: Math.floor(rng() * 12),
      balance: Math.round(balance * 100) / 100,
    };
  });
}

const BOT_CHIPS = [10, 50, 100, 500, 1000];

// The crowd plays the two sides overwhelmingly; Pair Plus is the minority
// "gambler's" bet, which is what makes it feel like a side bet on the table.
function botZone(rng: () => number): TpZone {
  const r = rng();
  return r < 0.43 ? "player-a" : r < 0.86 ? "player-b" : r < 0.93 ? "pp-a" : "pp-b";
}

// Per-round chip placements: ~75% of bots play, 1–4 chips each, jittered across
// the betting window (finishing before the lock). Sorted by time so the round
// loop can consume them with a single advancing index.
export function makeBotEvents(roundSeed: number, botCount: number): TpBotEvent[] {
  const rng = mulberry32(roundSeed ^ 0x51ed270b);
  const events: TpBotEvent[] = [];
  for (let botIdx = 0; botIdx < botCount; botIdx++) {
    if (rng() < 0.25) continue;
    const places = 1 + Math.floor(rng() * 4);
    // Most bots favour one side for the round (herd feel), with some scatter.
    const favourite = botZone(rng);
    for (let p = 0; p < places; p++) {
      const cr = rng();
      const amount =
        cr < 0.22 ? BOT_CHIPS[0] :
        cr < 0.55 ? BOT_CHIPS[1] :
        cr < 0.85 ? BOT_CHIPS[2] :
        cr < 0.97 ? BOT_CHIPS[3] : BOT_CHIPS[4];
      events.push({
        at: 0.5 + rng() * 18,
        botIdx,
        zone: rng() < 0.75 ? favourite : botZone(rng),
        amount,
      });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

// Zone-wise totals a set of events adds up to (used for per-bot settlement drift).
export function sumEventsByBot(events: TpBotEvent[]): Map<number, TpBets> {
  const map = new Map<number, TpBets>();
  for (const e of events) {
    const cur = map.get(e.botIdx) ?? emptyTpBets();
    cur[e.zone] += e.amount;
    map.set(e.botIdx, cur);
  }
  return map;
}

export { TP_ZONES };
