"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GamesWrapper from "@/components/games/games-wrapper";
import { DepositSheet } from "@/components/deposit-sheet";
import { playClick } from "@/lib/sound";
import { getSoundSettings, onSoundSettingsChange } from "@/lib/sound-settings";
import { hapticTap, hapticWin, hapticLoss } from "@/lib/haptics";
import { fireWinConfetti } from "@/lib/confetti";

/* ── Constants ──────────────────────────────────────────────────────────── */
const GRID = 5;
const TILES = GRID * GRID;
const MIN_BET = 10;
const MAX_BET = 20000;
const HOUSE_EDGE = 0.05;
const PRESETS = [100, 500, 1000, 5000] as const;
const MINES_OPTIONS = [3, 5, 10, 25] as const;
const RECENT_MAX = 12;

type Phase = "idle" | "playing" | "lost" | "cashed";
type RecentKind = "cashout" | "loss";
type GemStyle = "circle" | "diamond";
type TileState = "hidden" | "safe" | "mine" | "hidden-revealed-safe" | "hidden-revealed-mine";
type FloatKind = "win" | "lose" | "neutral";

interface RecentRound {
  mult: number;
  kind: RecentKind;
}

interface FloatMessage {
  id: number;
  text: string;
  kind: FloatKind;
}

interface MinesGameProps {
  initialBalance?: number;
}

interface WalletSummaryResponse {
  balance: number;
}


/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmtPKR(n: number) {
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCompact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : n.toFixed(0);
}

/* Payout: (1 - edge) * C(25, k) / C(25 - mines, k) */
function comb(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
function payoutMultiplier(mines: number, safeRevealed: number) {
  if (safeRevealed === 0) return 1;
  return ((1 - HOUSE_EDGE) * comb(TILES, safeRevealed)) / comb(TILES - mines, safeRevealed);
}

/* Decode the XOR-encoded mineSet returned by the server */
function decodeMineSet(encoded: string, roundId: string): Set<number> {
  try {
    const key = roundId.replace(/-/g, "");
    const pairs = encoded.match(/.{2}/g) ?? [];
    const decoded = pairs
      .map((hex, i) => String.fromCharCode(parseInt(hex, 16) ^ parseInt(key[i % key.length], 16)))
      .join("");
    const arr: unknown = JSON.parse(decoded);
    return Array.isArray(arr) ? new Set(arr as number[]) : new Set();
  } catch {
    return new Set();
  }
}

/* Provably-fair-ish seeded RNG (mulberry32) ── seed → mine positions */
function hashStr(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mineSetFromSeed(seedStr: string, mines: number): Set<number> {
  const rng = mulberry32(hashStr(seedStr));
  const pool = Array.from({ length: TILES }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return new Set(pool.slice(0, mines));
}
function shortHash(seedStr: string) {
  const h = hashStr(seedStr).toString(16).padStart(8, "0");
  return `${h.slice(0, 4)}${h.slice(4, 8)}`;
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function RecentChip({ item }: { item: RecentRound }) {
  const cls =
    item.kind === "loss"
      ? "border-bp-lose/50 bg-bp-lose/15 text-bp-lose"
      : "border-bp-win/50 bg-bp-win/15 text-bp-win";
  return (
    <div className={`shrink-0 rounded-full border px-2.5 py-1 font-bp-mono text-[11px] font-black ${cls}`}>
      {item.kind === "loss" ? "0.00" : item.mult.toFixed(2)}×
    </div>
  );
}

function GemGlyph({ style }: { style: GemStyle }) {
  if (style === "circle") {
    return (
      <div className="relative h-[42%] w-[42%]">
        <div
          className="absolute inset-0 rounded-full bg-bp-win"
          style={{
            boxShadow:
              "inset 0 -3px 8px rgba(0,0,0,.35), inset 0 3px 6px rgba(255,255,255,.55), 0 0 18px rgba(94,234,212,.55)",
          }}
        />
        <div className="absolute left-[26%] top-[22%] h-[26%] w-[26%] rounded-full bg-white/70 blur-[2px]" />
      </div>
    );
  }
  return (
    <div className="relative h-[44%] w-[44%]" style={{ transform: "rotate(45deg)" }}>
      <div
        className="absolute inset-0 rounded-[6px] bg-gradient-to-br from-[#9bf6e7] via-bp-win to-[#1eb39b]"
        style={{
          boxShadow:
            "inset 0 -4px 10px rgba(0,0,0,.35), inset 0 4px 8px rgba(255,255,255,.55), 0 0 22px rgba(94,234,212,.55)",
        }}
      />
      <div className="absolute left-[12%] top-[12%] h-[24%] w-[24%] rounded-[3px] bg-white/70" />
    </div>
  );
}

function MineGlyph() {
  return (
    <div className="relative h-[46%] w-[46%]">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 28%, #4d3a3f 0%, #1c0e16 60%, #0b0507 100%)",
          boxShadow:
            "inset 0 -3px 8px rgba(0,0,0,.6), inset 0 3px 6px rgba(255,255,255,.18), 0 0 22px rgba(255,93,115,.55)",
        }}
      />
      <div className="absolute left-[22%] top-[20%] h-[22%] w-[22%] rounded-full bg-white/40 blur-[1.5px]" />
      <div className="absolute left-[58%] top-[-12%] h-[28%] w-[8%] rotate-[18deg] rounded-full bg-[#3a2628]" />
      <div
        className="absolute left-[64%] top-[-18%] h-[18%] w-[18%] rounded-full bg-bp-accent"
        style={{ boxShadow: "0 0 14px rgba(242,154,11,.85), 0 0 4px rgba(255,255,255,.9) inset" }}
      />
    </div>
  );
}

function Tile({ state, gemStyle, multAtReveal, onClick, dim, isJustRevealedMine }: {
  state: TileState;
  gemStyle: GemStyle;
  multAtReveal?: number;
  onClick: () => void;
  dim?: boolean;
  isJustRevealedMine?: boolean;
}) {
  const isHidden = state === "hidden";
  const isSafe = state === "safe" || state === "hidden-revealed-safe";
  const isMine = state === "mine" || state === "hidden-revealed-mine";
  const wasReveal = state === "safe" || state === "mine";

  return (
    <button
      onClick={onClick}
      disabled={!isHidden}
      className={`group relative h-full w-full overflow-hidden rounded-[12px] sm:rounded-[16px] border transition-all duration-200
        ${isHidden
          ? "border-white/[0.06] bg-gradient-to-b from-[#1a1530] to-[#0f0b22] hover:border-bp-accent/40 hover:from-[#221b3e] hover:to-[#13102a] active:scale-[.97]"
          : ""
        }
        ${state === "safe" ? "border-bp-win/30 bg-bp-win/[0.06]" : ""}
        ${state === "mine" ? "border-bp-lose/50 bg-bp-lose/[0.10]" : ""}
        ${state === "hidden-revealed-safe" ? "border-white/[0.04] bg-bp-win/[0.04] opacity-60" : ""}
        ${state === "hidden-revealed-mine" ? "border-white/[0.04] bg-bp-lose/[0.06] opacity-60" : ""}
        ${dim && isHidden ? "opacity-50" : ""}
      `}
      style={{ cursor: isHidden ? "pointer" : "default" }}
    >
      {isHidden && (
        <>
          <div className="pointer-events-none absolute inset-1 rounded-[10px] sm:rounded-[14px] border border-white/[0.04]" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.05) 0%, transparent 60%)" }}
          />
          <div className="absolute inset-0 flex items-center justify-center font-bp-mono text-[10px] font-black tracking-wider text-white/15 group-hover:text-bp-accent/50">
            ?
          </div>
        </>
      )}

      {isSafe && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ animation: wasReveal ? "mines-reveal-safe .42s ease-out" : "none" }}
        >
          <GemGlyph style={gemStyle} />
          {wasReveal && multAtReveal != null && (
            <div className="absolute bottom-1 left-1 right-1 text-center font-bp-mono text-[8px] sm:text-[9px] font-black text-bp-win/80">
              {multAtReveal.toFixed(2)}×
            </div>
          )}
        </div>
      )}

      {isMine && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ animation: isJustRevealedMine ? "mines-reveal-mine .55s ease-out" : "none" }}
        >
          <MineGlyph />
          {isJustRevealedMine && (
            <>
              <div
                className="pointer-events-none absolute inset-0 rounded-full border border-bp-lose/60"
                style={{ animation: "mines-shockwave .8s ease-out forwards" }}
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "radial-gradient(circle at 50% 50%, rgba(255,93,115,.35) 0%, transparent 65%)" }}
              />
            </>
          )}
        </div>
      )}
    </button>
  );
}

function SeedStrip({ seedStr, settled, onRotate }: { seedStr: string; settled: boolean; onRotate: () => void }) {
  const hash = useMemo(() => shortHash(seedStr), [seedStr]);
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-black/30 px-3 py-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[2px] text-white/40">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-bp-win shadow-[0_0_8px_rgba(94,234,212,.8)]" />
        Provably Fair
      </div>
      <div className="flex items-center gap-2">
        <div className="font-bp-mono text-[11px] font-bold text-white/65 tabular-nums">{hash}</div>
        <button
          onClick={onRotate}
          disabled={!settled}
          className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/55 hover:text-white disabled:opacity-30"
        >
          rotate
        </button>
      </div>
    </div>
  );
}

function FloatText({ id, text, kind }: { id: number | null; text: string; kind: FloatKind }) {
  if (!id) return null;
  const color =
    kind === "win"
      ? "text-bp-win drop-shadow-[0_0_18px_rgba(94,234,212,.7)]"
      : kind === "lose"
        ? "text-bp-lose drop-shadow-[0_0_18px_rgba(255,93,115,.7)]"
        : "text-bp-accent";
  return (
    <div
      key={id}
      className={`pointer-events-none absolute left-1/2 top-[58%] z-30 -translate-x-1/2 font-bp-mono text-3xl sm:text-4xl font-black ${color}`}
      style={{ animation: "mines-float-up 1.1s ease-out forwards" }}
    >
      {text}
    </div>
  );
}

/* ── Main game ──────────────────────────────────────────────────────────── */
export function MinesGame({ initialBalance = 12500 }: MinesGameProps) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [balance, setBalance] = useState<number>(initialBalance);
  const [amount, setAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>("500");
  const [mines, setMines] = useState<number>(3);

  const [phase, setPhase] = useState<Phase>("idle"); // idle | playing | lost | cashed
  const [revealed, setRevealed] = useState<boolean[]>(() => new Array(TILES).fill(false));
  const [picks, setPicks] = useState<number[]>([]); // safe pick order
  const [seedStr, setSeedStr] = useState<string>(() => `round-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  const [mineSet, setMineSet] = useState<Set<number>>(() => new Set<number>());
  const [hitMineIdx, setHitMineIdx] = useState<number | null>(null);
  // true = loss round: player clicks blind, first tile always hits mine via reveal API
  // false/null = win round: mineSet known, instant local reveals
  const [isLossRound, setIsLossRound] = useState(false);
  const [recents, setRecents] = useState<RecentRound[]>([
    { mult: 2.16, kind: "cashout" },
    { mult: 0, kind: "loss" },
    { mult: 4.5, kind: "cashout" },
    { mult: 1.49, kind: "cashout" },
    { mult: 0, kind: "loss" },
    { mult: 7.82, kind: "cashout" },
  ]);
  const [floatMsg, setFloatMsg] = useState<FloatMessage | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [autoCashoutTarget] = useState<number>(0); // 0 = off
  const playersOnline = useMemo(() => 1 + Math.floor(Math.random() * 999), []);

  // Sound refs
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const loseAudioRef = useRef<HTMLAudioElement | null>(null);
  const tickAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);

  // Server-round tracking
  const roundIdRef = useRef<string | null>(null);
  const [isStartingRound, setIsStartingRound] = useState(false);

  // Auto play
  const [autoPlay, setAutoPlay] = useState(false);
  const autoPlayRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stale-closure refs — kept in sync in render body (read only inside callbacks/timers)
  const phaseRef = useRef<Phase>("idle");
  const amountRef = useRef<number>(500);
  const balanceRef = useRef<number>(initialBalance);
  const minesRef = useRef<number>(3);
  const autoStartNextRoundRef = useRef<() => void>(() => { });

  /* ── Audio setup ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const sfx = getSoundSettings().sfx;
    winAudioRef.current = new Audio("/sounds/win.mp3");
    loseAudioRef.current = new Audio("/sounds/loss.mp3");
    tickAudioRef.current = new Audio("/sounds/button-click.mp3");
    [winAudioRef.current, loseAudioRef.current, tickAudioRef.current].forEach((a) => {
      if (a) a.volume = sfx;
    });
    return () => {
      winAudioRef.current?.pause();
      loseAudioRef.current?.pause();
      tickAudioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const bg = new Audio("/sounds/mines/bg-sound.mp3");
    bg.loop = true;
    bg.volume = getSoundSettings().bgMusic * 0.6;
    bg.play().catch(() => { });
    bgAudioRef.current = bg;
    return () => {
      bg.pause();
      bg.src = "";
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (!bgAudioRef.current) return;
      if (document.hidden) bgAudioRef.current.pause();
      else bgAudioRef.current.play().catch(() => { });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    return onSoundSettingsChange((s) => {
      [winAudioRef.current, loseAudioRef.current, tickAudioRef.current].forEach((a) => {
        if (a) a.volume = s.sfx;
      });
      if (bgAudioRef.current) bgAudioRef.current.volume = s.bgMusic * 0.6;
    });
  }, []);

  const playAudio = useCallback((ref: React.RefObject<HTMLAudioElement | null>) => {
    if (!ref.current) return;
    ref.current.currentTime = 0;
    ref.current.play().catch(() => { });
  }, []);

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const safeCount = picks.length;
  const currentMult = useMemo(() => payoutMultiplier(mines, safeCount), [mines, safeCount]);
  const nextMult = useMemo(() => payoutMultiplier(mines, safeCount + 1), [mines, safeCount]);
  const potential = amount * currentMult;
  const profit = potential - amount;
  const nextProfit = amount * nextMult - amount;
  const maxSafe = TILES - mines;
  const inPlay = phase === "playing";
  const settled = phase !== "playing";

  const multAtIndex = useMemo(() => {
    const m: Record<number, number> = {};
    picks.forEach((idx, k) => {
      m[idx] = payoutMultiplier(mines, k + 1);
    });
    return m;
  }, [picks, mines]);

  // Sync stale-closure refs on every render
  phaseRef.current = phase;
  amountRef.current = amount;
  balanceRef.current = balance;
  minesRef.current = mines;

  /* ── Actions ─────────────────────────────────────────────────────────── */
  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/summary", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as WalletSummaryResponse;
        setBalance(data.balance);
      }
    } catch {
      /* silent */
    }
  }, []);

  const stopAutoPlayFn = useCallback(() => {
    autoPlayRef.current = false;
    setAutoPlay(false);
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
  }, []);

  const toggleAutoPlay = useCallback(() => {
    playClick();
    if (autoPlayRef.current) { stopAutoPlayFn(); return; }
    if (phaseRef.current === "playing") return;
    autoPlayRef.current = true;
    setAutoPlay(true);
  }, [stopAutoPlayFn]);

  const cashout = useCallback(() => {
    if (!inPlay || safeCount === 0) return;
    const win = amount * currentMult;
    // Optimistic UI update
    setBalance((b) => b + win);
    setRecents((r) => [{ mult: currentMult, kind: "cashout" as RecentKind }, ...r].slice(0, RECENT_MAX));
    setFloatMsg({ id: Date.now(), text: `+PKR ${fmtPKR(win - amount)}`, kind: "win" });
    setStatusMsg(`Cashed out @ ${currentMult.toFixed(2)}×`);
    setPhase("cashed");
    hapticWin();
    playAudio(winAudioRef);
    fireWinConfetti();
    // Server validates picks against stored mineSet and uses stored betAmount —
    // client cannot inflate safeRevealed or amount.
    const roundId = roundIdRef.current;
    if (roundId) {
      roundIdRef.current = null;
      fetch("/api/games/mines/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, outcome: "cashed", picks }),
      })
        .then((r) => r.json())
        .then(({ newBalance }) => { if (typeof newBalance === "number") setBalance(newBalance); })
        .catch(() => { });
    }
  }, [inPlay, safeCount, amount, currentMult, picks, playAudio]);

  // Auto cashout
  useEffect(() => {
    if (!inPlay || !autoCashoutTarget || autoCashoutTarget <= 1) return;
    if (currentMult >= autoCashoutTarget) cashout();
  }, [currentMult, inPlay, autoCashoutTarget, cashout]);

  const doStartRound = useCallback(async (betAmount: number, minesCount: number) => {
    if (isStartingRound) return;
    setIsStartingRound(true);
    try {
      const res = await fetch("/api/games/mines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: betAmount, minesCount }),
      });
      const json = await res.json();
      if (!res.ok) { setStatusMsg(json.error ?? "Failed to start round"); return; }
      const { roundId, mineSet: encodedMineSet, seedHash, newBalance } = json as {
        roundId: string; mineSet: string; seedHash: string; newBalance: number;
      };
      roundIdRef.current = roundId;
      setBalance(newBalance);
      const decoded = decodeMineSet(encodedMineSet, roundId);
      if (decoded.has(-1)) {
        // Loss round — sentinel detected. mineSet is withheld; first click shows
        // mine instantly with zero API calls (same network shape as win rounds).
        setMineSet(new Set<number>());
        setIsLossRound(true);
      } else {
        // Win round — real mine positions decoded for instant local reveals
        setMineSet(decoded);
        setIsLossRound(false);
      }
      setSeedStr(seedHash);
      setRevealed(new Array(TILES).fill(false));
      setPicks([]);
      setHitMineIdx(null);
      setFloatMsg(null);
      setStatusMsg(null);
      setPhase("playing");
      playClick();
      hapticTap();
    } catch {
      setStatusMsg("Network error — try again");
    } finally {
      setIsStartingRound(false);
    }
  }, [isStartingRound, playClick]);

  const startRound = () => {
    if (phase === "playing" || isStartingRound) return;
    if (amount < MIN_BET || amount > balance) { setDepositOpen(true); return; }
    doStartRound(amount, mines);
  };

  const newRound = () => {
    setSeedStr(`round-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    setRevealed(new Array(TILES).fill(false));
    setPicks([]);
    setMineSet(new Set<number>());
    setHitMineIdx(null);
    setFloatMsg(null);
    setStatusMsg(null);
    setIsLossRound(false);
    setPhase("idle");
  };

  const rotateSeed = () => {
    if (settled) setSeedStr(`round-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  };

  const handleMineHit = (idx: number, revealedMineSet: number[]) => {
    setHitMineIdx(idx);
    setMineSet(new Set(revealedMineSet));
    setRecents((r) => [{ mult: 0, kind: "loss" as RecentKind }, ...r].slice(0, RECENT_MAX));
    setFloatMsg({ id: Date.now(), text: `-PKR ${fmtPKR(amount)}`, kind: "lose" });
    setStatusMsg(`Hit mine on tile ${idx + 1}`);
    setPhase("lost");
    hapticLoss();
    playAudio(loseAudioRef);
  };

  const onTileClick = (idx: number) => {
    if (!inPlay || revealed[idx]) return;

    if (isLossRound) {
      // ── LOSS ROUND: instant mine, zero API calls ───────────────────────────
      // Sentinel [-1] was decoded at round start. Any click = mine.
      // Generate a cosmetic mine layout (looks natural) using the round seed
      // so it's deterministic and consistent with the provably-fair seed strip.
      const cosmeticMines = new Set<number>([idx]);
      const rng = mulberry32(hashStr(seedStr + String(idx)));
      while (cosmeticMines.size < mines) cosmeticMines.add(Math.floor(rng() * 25));
      const nextRev = revealed.slice(); nextRev[idx] = true;
      setRevealed(nextRev);
      const roundId = roundIdRef.current;
      roundIdRef.current = null;
      handleMineHit(idx, [...cosmeticMines]);
      // Settle as lost — server validates isWinRound=false and pays 0
      if (roundId) {
        fetch("/api/games/mines/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roundId, outcome: "lost", picks: [], hitTile: idx }),
        }).catch(() => { });
      }
      return;
    }

    // ── WIN ROUND: instant local reveal using known mineSet ──────────────────
    const isMine = mineSet.has(idx);
    const nextRev = revealed.slice(); nextRev[idx] = true;
    setRevealed(nextRev);

    if (isMine) {
      const roundId = roundIdRef.current;
      roundIdRef.current = null;
      handleMineHit(idx, [...mineSet]);
      if (roundId) {
        fetch("/api/games/mines/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roundId, outcome: "lost", picks, hitTile: idx }),
        }).catch(() => { });
      }
      return;
    }

    const nextPicks = [...picks, idx];
    setPicks(nextPicks);
    playClick();
    hapticTap();

    if (nextPicks.length === maxSafe) {
      const m = payoutMultiplier(mines, nextPicks.length);
      const win = amount * m;
      setBalance((b) => b + win);
      setRecents((r) => [{ mult: m, kind: "cashout" as RecentKind }, ...r].slice(0, RECENT_MAX));
      setFloatMsg({ id: Date.now(), text: `+PKR ${fmtPKR(win - amount)}`, kind: "win" });
      setStatusMsg(`Perfect clear @ ${m.toFixed(2)}×`);
      setPhase("cashed");
      hapticWin();
      playAudio(winAudioRef);
      fireWinConfetti();
      const roundId = roundIdRef.current;
      if (roundId) {
        roundIdRef.current = null;
        fetch("/api/games/mines/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roundId, outcome: "cashed", picks: nextPicks }),
        })
          .then((r) => r.json())
          .then(({ newBalance }) => { if (typeof newBalance === "number") setBalance(newBalance); })
          .catch(() => { });
      }
    }
  };

  const autoStartNextRound = useCallback(() => {
    if (!autoPlayRef.current) return;
    if (balanceRef.current < amountRef.current) { stopAutoPlayFn(); return; }
    doStartRound(amountRef.current, minesRef.current);
  }, [stopAutoPlayFn, doStartRound]);

  autoStartNextRoundRef.current = autoStartNextRound;

  // Auto-restart: when a round ends and auto play is on, start next round after delay
  useEffect(() => {
    if (!autoPlayRef.current || (phase !== "lost" && phase !== "cashed")) return;
    const t = setTimeout(() => {
      autoTimerRef.current = null;
      autoStartNextRoundRef.current();
    }, 1500);
    autoTimerRef.current = t;
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => () => { stopAutoPlayFn(); }, [stopAutoPlayFn]);

  useEffect(() => {
    if (phase !== "lost" && phase !== "cashed") return;
    const t = setTimeout(() => setFloatMsg(null), 1100);
    return () => clearTimeout(t);
  }, [phase]);

  const setBet = (v: number) => {
    const n = Math.min(MAX_BET, Math.max(MIN_BET, Math.round(v)));
    setAmount(n);
    setCustomAmount(String(n));
  };
  const onCustomChange = (v: string) => {
    setCustomAmount(v);
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) setAmount(Math.min(MAX_BET, Math.max(MIN_BET, n)));
  };

  const tileState = (i: number): TileState => {
    if (revealed[i]) return mineSet.has(i) ? "mine" : "safe";
    if (phase === "lost" && mineSet.has(i)) return "hidden-revealed-mine";
    if (phase === "cashed" && mineSet.has(i)) return "hidden-revealed-mine";
    if (phase === "cashed" && !mineSet.has(i)) return "hidden-revealed-safe";
    return "hidden";
  };

  /* ── Main action button ──────────────────────────────────────────────── */
  const mainBtn = (() => {
    if (phase === "playing") {
      if (safeCount === 0) {
        return (
          <button disabled className="flex-1 rounded-2xl py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-white/40 border border-dashed border-white/15 bg-transparent">
            Pick a tile to start
          </button>
        );
      }
      return (
        <button
          onClick={cashout}
          className="flex-1 rounded-2xl bg-gradient-to-b from-bp-win to-[#1eb39b] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-[#062e26] shadow-[0_4px_22px_rgba(94,234,212,0.4)] transition-all hover:opacity-95 active:scale-[.99]"
        >
          Cash Out{" "}
          <span className="font-bp-mono text-[15px] opacity-90">PKR {fmtPKR(potential)}</span>
        </button>
      );
    }
    if (phase === "lost" || phase === "cashed") {
      if (autoPlay) {
        return (
          <button disabled className="flex-1 rounded-2xl border border-white/[0.10] bg-white/[0.05] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-white/50">
            <span className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white/50" />
              Next Round…
            </span>
          </button>
        );
      }
      return (
        <button
          onClick={newRound}
          className="flex-1 rounded-2xl border border-white/[0.10] bg-white/[0.05] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-white/85 hover:bg-white/[0.08] active:scale-[.99]"
        >
          New Round
        </button>
      );
    }
    return (
      <button
        onClick={startRound}
        disabled={isStartingRound}
        className="flex-1 rounded-2xl bg-gradient-to-b from-bp-accent to-[#c97e08] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-[#1b1305] shadow-[0_4px_18px_rgba(242,154,11,0.45)] transition-all hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-none disabled:bg-white/[0.05] disabled:text-white/35 disabled:shadow-none"
      >
        {isStartingRound ? "Starting…" : autoPlay ? "Start Auto" : "Bet"}{" "}
        {!isStartingRound && <span className="font-bp-mono opacity-90">PKR {fmtPKR(amount)}</span>}
      </button>
    );
  })();

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <>
      <GamesWrapper
        balance={balance}
        name="Mines"
        subtitle="Provably Fair · 5×5 Grid"
        gameType="mines"
        isPlaying={inPlay}
        stopAutoPlay={stopAutoPlayFn}
        onDepositClose={refreshBalance}
        autoPlay={autoPlay}
      >
        {/* ── Stage ── */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_70%_at_50%_60%,rgba(242,154,11,0.10)_0%,transparent_70%),radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(100,80,200,0.10)_0%,transparent_60%),linear-gradient(180deg,#0a0812_0%,#0c0918_100%)]">

          {/* Recent chips */}
          <div className="z-10 flex items-center justify-between gap-2 px-3 pt-3">
            <div className="flex max-w-[80%] items-center gap-1.5 overflow-hidden rounded-full border border-white/[0.06] bg-black/45 px-2.5 py-1.5 backdrop-blur">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bp-win shadow-[0_0_10px_rgba(94,234,212,.8)]" />
              <span className="mr-1 shrink-0 text-[9px] font-black uppercase tracking-[2px] text-white/45">
                Recent
              </span>
              <div className="flex gap-1.5 overflow-hidden mines-no-scrollbar">
                {recents.map((r, i) => (
                  <RecentChip key={i} item={r} />
                ))}
              </div>
            </div>
            <div className="hidden sm:flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.06] bg-black/45 px-2.5 py-1.5 backdrop-blur font-bp-mono text-[10px] font-bold uppercase tracking-[2px] text-white/45">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m13 2-3 7h6l-3 7" />
              </svg>
              {playersOnline} playing
            </div>
          </div>

          {/* Multiplier readout */}
          <div className="z-[1] flex flex-col items-center px-3 pt-2 pb-1 pointer-events-none">
            <div className="text-[9px] font-black uppercase tracking-[4px] text-white/35">
              {inPlay
                ? "Current Multiplier"
                : phase === "cashed"
                  ? "Cashed Out"
                  : phase === "lost"
                    ? "Boom!"
                    : "Multiplier"}
            </div>
            <div
              className={`font-bp-mono text-[40px] sm:text-[52px] font-black leading-none tracking-[-.06em] ${phase === "lost"
                ? "text-bp-lose drop-shadow-[0_0_22px_rgba(255,93,115,.35)]"
                : currentMult > 1
                  ? "text-bp-accent drop-shadow-[0_0_22px_rgba(242,154,11,.4)]"
                  : "text-white/80"
                }`}
            >
              {currentMult.toFixed(2)}
              <span className="text-[.55em] opacity-70">×</span>
            </div>
            <div className="mt-0.5 min-h-4 text-center text-[11px] sm:text-[12px] font-bold uppercase tracking-[2px] text-white/45">
              {statusMsg ||
                (inPlay
                  ? safeCount === 0
                    ? "Pick a tile"
                    : `Next: ${nextMult.toFixed(2)}× · +PKR ${fmtPKR(nextProfit)}`
                  : "Set bet & mines, then press Bet")}
            </div>
          </div>

          {/* 5×5 grid — auto-fits available space via container queries */}
          <div className="mines-grid-wrap relative grid min-h-0 flex-1 place-items-center px-2 pb-1">
            <div className="mines-grid-inner grid grid-cols-5 grid-rows-5 gap-1.5 sm:gap-2">
              {Array.from({ length: TILES }).map((_, i) => (
                <Tile
                  key={i}
                  state={tileState(i)}
                  gemStyle="diamond"
                  multAtReveal={multAtIndex[i]}
                  onClick={() => onTileClick(i)}
                  dim={phase === "lost" && !revealed[i] && !mineSet.has(i)}
                  isJustRevealedMine={i === hitMineIdx}
                />
              ))}
            </div>

            {/* Round-start loading overlay — shown while API fetches the round */}
            {isStartingRound && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-black/50 backdrop-blur-sm">
                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-3 w-3 rounded-full bg-bp-accent animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">
                  Preparing Round
                </p>
              </div>
            )}
          </div>

          {/* Float text */}
          {floatMsg && <FloatText id={floatMsg.id} text={floatMsg.text} kind={floatMsg.kind} />}

          {/* Bottom badges */}
          <div className="z-10 flex items-center justify-between gap-2 px-3 pb-2.5">
            <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/55 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-white/55 backdrop-blur">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              ROUND #{shortHash(seedStr).slice(0, 6).toUpperCase()}
            </div>
            <div className="rounded-full border border-white/[0.06] bg-black/55 px-2.5 py-1 font-bp-mono text-[10px] font-bold text-white/55 backdrop-blur tabular-nums">
              {safeCount}/{maxSafe} gems · {mines} mines
            </div>
          </div>
        </div>

        {/* ── Controls ── */}
        <div
          className="flex w-full flex-shrink-0 flex-col gap-2.5 border-t border-white/[0.06] bg-gradient-to-b from-[rgba(8,10,20,0.82)] to-[rgba(10,8,18,1)] px-3 pt-3 lg:w-[380px] lg:border-l lg:border-t-0 lg:gap-3 lg:overflow-y-auto lg:py-3"
          style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
        >
          {/* Bet amount */}
          <div
            className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 ${inPlay || autoPlay ? "pointer-events-none opacity-55" : ""}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-[1.5px] text-white/55">Bet Amount</span>
              <span className="font-bp-mono text-[12px] font-semibold text-white/35">PKR</span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={customAmount}
                onChange={(e) => onCustomChange(e.target.value)}
                min={MIN_BET}
                max={MAX_BET}
                className="flex-1 rounded-xl border border-white/[0.06] bg-black/30 py-3 px-3 font-bp-mono text-[16px] font-bold text-white outline-none focus:border-bp-accent/40"
              />
              <button
                onClick={() => { playClick(); setBet(amount / 2); }}
                className="rounded-xl border border-white/[0.06] bg-black/30 px-4 font-bp-mono text-[16px] font-bold text-white/85 hover:bg-black/40"
              >
                ½
              </button>
              <button
                onClick={() => { playClick(); setBet(amount * 2); }}
                className="rounded-xl border border-white/[0.06] bg-black/30 px-4 font-bp-mono text-[16px] font-bold text-white/85 hover:bg-black/40"
              >
                2×
              </button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => { playClick(); setBet(p); }}
                  className={`rounded-lg border py-2 font-bp-mono text-[16px] font-bold transition-colors ${amount === p
                    ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent"
                    : "border-white/[0.06] bg-black/25 text-white/70 hover:bg-black/40"
                    }`}
                >
                  {p >= 1000 ? `${p / 1000}k` : p}
                </button>
              ))}
            </div>
          </div>

          {/* Mines picker */}
          <div
            className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 ${inPlay || autoPlay ? "pointer-events-none opacity-55" : ""}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-[1.5px] text-white/55">Mines</span>
              <span className="font-bp-mono text-[15px] font-black text-bp-accent">
                {mines} on board
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {MINES_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => { playClick(); setMines(m); }}
                  className={`rounded-xl border py-2.5 font-bp-mono text-[16px] font-bold transition-colors ${mines === m
                    ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent"
                    : "border-white/[0.06] bg-black/25 text-white/70 hover:bg-black/40"
                    }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/25 px-2 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Gems</div>
              <div className="font-bp-mono text-[17px] font-black text-white tabular-nums">
                {safeCount}/{maxSafe}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/25 px-2 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Next</div>
              <div className="font-bp-mono text-[17px] font-black text-bp-accent">
                {nextMult.toFixed(2)}×
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/25 px-2 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Profit</div>
              <div
                className={`font-bp-mono text-[17px] font-black ${profit > 0 ? "text-bp-win" : "text-white/80"}`}
              >
                +{fmtCompact(Math.max(0, profit))}
              </div>
            </div>
          </div>

          {/* Provably fair */}
          <SeedStrip seedStr={seedStr} settled={settled} onRotate={rotateSeed} />

          {/* Main action */}
          <div className="flex gap-2.5">
            {mainBtn}
            <button
              onClick={toggleAutoPlay}
              disabled={!autoPlay && (inPlay || amount < MIN_BET || amount > balance)}
              className={`min-w-[74px] rounded-2xl border py-4 font-bp-ui text-[13px] font-black uppercase tracking-[1.5px] transition-all ${autoPlay
                  ? "border-bp-accent/60 bg-bp-accent/20 text-bp-accent shadow-[0_2px_16px_rgba(242,154,11,0.2)]"
                  : "border-white/[0.08] bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                }`}
            >
              {autoPlay ? "Stop" : "Auto"}
            </button>
          </div>
        </div>

        {/* Component-scoped animations */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
            @keyframes mines-reveal-safe {
              0%   { transform: scale(1); }
              35%  { transform: scale(.86); }
              65%  { transform: scale(1.06); }
              100% { transform: scale(1); }
            }
            @keyframes mines-reveal-mine {
              0%   { transform: scale(1); }
              20%  { transform: scale(.92); }
              50%  { transform: scale(1.12); filter: brightness(1.6); }
              100% { transform: scale(1); filter: brightness(1); }
            }
            @keyframes mines-shockwave {
              0%   { transform: scale(.3); opacity: .85; }
              100% { transform: scale(3.2); opacity: 0; }
            }
            @keyframes mines-float-up {
              0%   { opacity: 0; transform: translate(-50%, 12px); }
              20%  { opacity: 1; }
              100% { opacity: 0; transform: translate(-50%, -64px); }
            }
            .mines-no-scrollbar::-webkit-scrollbar { display: none; }
            .mines-no-scrollbar { scrollbar-width: none; }
            .mines-grid-wrap { container-type: size; }
            .mines-grid-inner {
              width:  min(100cqw, 100cqh);
              height: min(100cqw, 100cqh);
            }
          `,
          }}
        />
      </GamesWrapper>
      <DepositSheet includePaddingBottom={false} open={depositOpen} onClose={async () => { setDepositOpen(false); await refreshBalance(); }} />
    </>
  );
}

export default MinesGame;
