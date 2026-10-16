"use client";

import type { LiveBet, PlayerBet } from "./types";
import { UsersIcon } from "./icons";

const NAME_POOL = [
  "ahmed", "ali", "usman", "hassan", "zain", "bilal", "fahad", "omar",
  "tariq", "imran", "asad", "danish", "raza", "kashif", "faisal", "noman",
  "adeel", "sohail", "kamran", "shahid", "naveed", "arif", "salman", "iqbal",
  "rizwan", "junaid", "waqas", "hamza", "mudassar", "talha", "saad", "zubair",
  "usama", "farhan", "amir", "nasir", "khalid", "waseem", "irfan", "nadeem",
  "noor", "sana", "ayesha", "fatima", "zara", "hira", "maryam", "sofia",
  "sara", "layla", "amna", "rida", "eman", "farah", "rabia", "sadia",
  "james", "mike", "john", "alex", "sam", "max", "ryan", "jake",
  "emma", "sophie", "anna", "kate", "amy", "rose", "jade", "luke",
  "mark", "liam", "jack", "oliver", "harry", "tom", "kai", "rex",
  "leo", "noah", "ethan", "mason", "logan", "elijah", "lucas", "aiden",
  "yusuf", "ibrahim", "abdur", "suleman", "hasan", "musa", "omer", "babar",
  "shahzaib", "saqlain", "haider", "umair", "zohaib", "muneeb", "asif", "zahid",
  "shayan", "rehan", "ahsan", "mohsin", "zeeshan", "aamir", "uzair", "arbaz",
  "hasnain", "talal", "sarim", "affan", "taimur", "rafay", "zaroon", "rayyan",
  "zoya", "aroha", "kinza", "nimra", "maham", "alisha", "areeba", "hania",
  "maha", "bisma", "anaya", "rimal", "hoorain", "zainab", "iqra", "sobia",
  "ryan", "ethan", "tyler", "brandon", "justin", "nathan", "derek", "trevor",
  "carlos", "miguel", "andres", "diego", "jorge", "pablo", "luis", "mario",
  "chen", "wei", "ming", "jin", "xiao", "yang", "fang", "hong",
  "yuki", "kenji", "hiroshi", "takeshi", "ryu", "sora", "hana", "aiko",
];

const NAME_SUFFIXES = [
  "786", "007", "99", "01", "23", "42", "77", "11", "22", "88",
  "_x", "_z", "_pk", "_gg", "pro", "win", "ace", "_07", "_786", "369",
  "_xo", "_vip", "king", "god", "_ok", "369", "420", "69x", "star", "_op",
];

function generateUsername(rng: () => number): string {
  const base = NAME_POOL[Math.floor(rng() * NAME_POOL.length)];
  const r = rng();
  const suffix = NAME_SUFFIXES[Math.floor(rng() * NAME_SUFFIXES.length)];
  if (r < 0.3) {
    return `${base[0]}***${base.slice(-1)}${suffix}`;
  } else if (r < 0.6) {
    return `${base}${suffix}`;
  } else {
    const num = Math.floor(rng() * 900) + 10;
    return `${base}_${num}`;
  }
}

const AVATAR_CLASSES = [
  "from-sky-400 to-blue-700",
  "from-violet-400 to-purple-800",
  "from-amber-300 to-orange-700",
  "from-emerald-400 to-teal-800",
  "from-rose-400 to-pink-800",
  "from-cyan-300 to-indigo-700",
];

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

export function randomBets(roundSeed: number): LiveBet[] {
  const rng = mulberry32(roundSeed);
  const total = 18 + Math.floor(rng() * 25); // 18–42 players per round

  return Array.from({ length: total }, (_, i) => {
    const name        = generateUsername(rng);
    const avatarIndex = Math.floor(rng() * AVATAR_CLASSES.length);

    // Bet amount — weighted toward realistic small/medium stakes
    const aR = rng();
    const amount =
      aR < 0.10 ? 50    :
      aR < 0.28 ? 100   :
      aR < 0.45 ? 200   :
      aR < 0.55 ? 300   :
      aR < 0.70 ? 500   :
      aR < 0.82 ? 1000  :
      aR < 0.90 ? 2000  :
      aR < 0.96 ? 5000  :
      aR < 0.99 ? 10000 : 20000;

    // Cashout target — ALL players set a target; distribution is exponential-like
    // so most cash out early, fewer go high, matching real crash-game behaviour.
    const tR = rng();
    const span = rng();
    const target =
      tR < 0.45 ? 1.05 + span * 0.75  // 1.05 – 1.80×  (conservative, bulk of players)
    : tR < 0.70 ? 1.80 + span * 1.20  // 1.80 – 3.00×  (moderate)
    : tR < 0.85 ? 3.00 + span * 3.00  // 3.00 – 6.00×  (ambitious)
    : tR < 0.95 ? 6.00 + span * 6.00  // 6.00 – 12.00× (aggressive)
    :            12.00 + span * 18.00; // 12.00 – 30.00× (moonshot)

    return {
      id: `${roundSeed}:${i}`,
      name,
      avatarIndex,
      amount,
      cashedAt: null,
      cashedAtTarget: Number(target.toFixed(2)),
    };
  });
}

function fmt(n: number) {
  return n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

function Avatar({ name, avatarIndex }: { name: string; avatarIndex: number }) {
  const initials = name.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "??";

  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br text-[10px] font-black text-white ${AVATAR_CLASSES[avatarIndex % AVATAR_CLASSES.length]}`}>
      {initials}
    </div>
  );
}

function PlayerBetRow({ bet }: { bet: PlayerBet }) {
  const cashed  = bet.status === "cashed" && bet.cashedAt != null;
  const live    = bet.status === "inflight";
  const profit  = cashed ? bet.amount * (bet.cashedAt! - 1) : null;
  const initials = bet.name.replace(/[^a-z0-9·]/gi, "").slice(0, 2).toUpperCase() || "ME";

  return (
    <div className={`grid grid-cols-[1.2fr_0.65fr_0.6fr_0.8fr] items-center gap-1 border-b border-bp-accent/[0.12] px-3 py-2.5
      ${cashed ? "bg-emerald-400/[0.08]" : "bg-bp-accent/[0.06]"}`}>
      {/* Player */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-bp-accent/40 bg-gradient-to-br from-bp-accent to-[#c97e08] text-[9px] font-black text-[#1b1305]">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-bold text-bp-accent leading-none">{bet.name}</div>
          <div className="mt-0.5 text-[8px] font-bold uppercase tracking-widest text-bp-accent/50">You</div>
        </div>
      </div>
      {/* Bet */}
      <div className="text-center font-mono text-xs font-bold text-white/80">{fmt(bet.amount)}</div>
      {/* × */}
      <div className={`text-center font-mono text-xs font-bold ${cashed ? "text-emerald-300" : live ? "text-bp-accent" : "text-white/30"}`}>
        {cashed ? `${bet.cashedAt!.toFixed(2)}×`
          : live  ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bp-accent" />
                LIVE
              </span>
            )
          : "—"}
      </div>
      {/* Profit */}
      <div className={`text-right font-mono text-xs font-bold ${cashed ? "text-emerald-400" : "text-white/20"}`}>
        {cashed && profit != null ? `+${fmt(profit)}` : "—"}
      </div>
    </div>
  );
}

export function LiveBetsPanel({
  bets,
  playerBets = [],
  totalBet,
  totalPlayers,
  collapsed,
  onToggleCollapse,
  onClose,
}: {
  bets: LiveBet[];
  playerBets?: PlayerBet[];
  totalBet: number;
  totalPlayers: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
}) {
  if (collapsed) {
    return (
      <aside className="flex h-full w-14 shrink-0 flex-col items-center gap-3 border-r border-white/10 bg-[#0b0916] py-3 text-white">
        <button type="button" onClick={onToggleCollapse} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10">
          <UsersIcon size={17} />
        </button>
        <div className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-black uppercase tracking-[0.25em] text-white/45">Live Bets</div>
        <div className="mt-auto rounded-full bg-amber-400/15 px-2 py-1 font-mono text-[10px] font-bold text-amber-300">{totalPlayers}</div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden border-r border-white/10 bg-[#0b0916] text-white">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
          <span className="text-[11px] font-black uppercase tracking-[0.22em]">All Bets</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onToggleCollapse} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/55 hover:bg-white/10">Collapse</button>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-sm font-bold text-white/55 hover:bg-rose-500/20 hover:text-rose-200">×</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid shrink-0 grid-cols-2 border-b border-white/10">
        <div className="border-r border-white/10 px-4 py-3">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">Total Bet</div>
          <div className="mt-1 font-mono text-sm font-bold text-amber-300">{fmt(totalBet)}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">Players</div>
          <div className="mt-1 font-mono text-sm font-bold text-white/85">{totalPlayers}</div>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid shrink-0 grid-cols-[1.2fr_0.65fr_0.6fr_0.8fr] border-b border-white/10 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">
        <div>Player</div>
        <div className="text-center">Bet</div>
        <div className="text-center">×</div>
        <div className="text-right">Profit</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Logged-in player's bets — always at the top */}
        {playerBets.length > 0 && (
          <>
            {playerBets.map((bet) => <PlayerBetRow key={bet.id} bet={bet} />)}
            <div className="mx-3 border-b border-bp-accent/[0.15]" />
          </>
        )}

        {/* Simulated live bets */}
        {bets.map((bet) => {
          const cashed = bet.cashedAt != null;
          const profit = cashed ? bet.amount * bet.cashedAt! : null;
          return (
            <div key={bet.id} className={`grid grid-cols-[1.2fr_0.65fr_0.6fr_0.8fr] items-center gap-1 border-b border-white/[0.03] px-3 py-2 ${cashed ? "bg-emerald-400/[0.06]" : ""}`}>
              <div className="flex min-w-0 items-center gap-2">
                <Avatar name={bet.name} avatarIndex={bet.avatarIndex} />
                <div className="truncate text-xs text-white/75">{bet.name}</div>
              </div>
              <div className="text-center font-mono text-xs text-white/65">{fmt(bet.amount)}</div>
              <div className={`text-center font-mono text-xs font-bold ${cashed ? "text-emerald-300" : "text-white/25"}`}>{cashed ? `${bet.cashedAt!.toFixed(2)}×` : "—"}</div>
              <div className={`text-right font-mono text-xs font-bold ${cashed ? "text-emerald-400" : "text-white/20"}`}>{profit != null ? `+${fmt(profit)}` : "—"}</div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
