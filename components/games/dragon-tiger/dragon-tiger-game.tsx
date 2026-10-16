"use client";

// Dragon vs Tiger — live-table clone (see lib/docs/new-games/game-6-dragon-tiger.md).
// Continuous per-client rounds (SkyRise architecture): the table runs forever on a
// wall-clock rAF loop; the server is hit ONCE per round, only when the player has
// chips down — a single request that debits, resolves and credits atomically. The
// client only animates the settled result. Bots are pure cosmetics (bots.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GamesNativeWrapper from "../games-native-wrapper";
import { GameModal } from "../game-modal";
import { DepositSheet } from "@/components/deposit-sheet";
import { SUITS, RANK_LABEL } from "../_shared/playing-card";
import {
  DT_BETTING_SECONDS, DT_FREE_SECONDS, DT_BETS_LOCK_SECONDS,
  DT_CHIP_VALUES, DT_MAX_TOTAL, DT_ZONES,
  emptyDtBets, dtTotal, dtReturn, sampleNaturalDtOutcome,
  type DtZone, type DtBets, type DtCard,
} from "@/lib/games/dragon-tiger";
import { makeRoster, makeBotEvents, sumEventsByBot, mulberry32, type DtBot, type DtBotEvent } from "./bots";
import { getSoundSettings, onSoundSettingsChange } from "@/lib/sound-settings";
import { hapticTap, hapticWin, hapticLoss } from "@/lib/haptics";
import { fireWinConfetti } from "@/lib/confetti";

// ─── Assets (WebP set — the PNG masters stay on disk as source) ───────────────

const A = (f: string) => `/games/dragon-tiger/${f}`;
const S = (f: string) => `/sounds/dragon-tiger/${f}`;
const CHIP_IMG = (v: number) => A(`chip-set/chip-set-${v}.webp`);
const AVATAR_IMG = (idx: number) => A(`avatar-pack/${(idx % 12) + 1}.webp`);

// Sprites can carry arbitrary amounts (a re-bet lands one sprite per zone total),
// so snap to the largest chip denomination ≤ the amount for the artwork.
const spriteChip = (v: number) => {
  for (let i = DT_CHIP_VALUES.length - 1; i >= 0; i--) {
    if (DT_CHIP_VALUES[i] <= v) return DT_CHIP_VALUES[i];
  }
  return DT_CHIP_VALUES[0];
};

// ─── Round clock (cosmetic round number, roughly synced across devices) ───────

const ROUND_MS = (DT_BETTING_SECONDS + DT_FREE_SECONDS) * 1000;
const ROUND_EPOCH_MS = Date.UTC(2025, 0, 1);
const clockRound = () => Math.floor((Date.now() - ROUND_EPOCH_MS) / ROUND_MS);

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "betting" | "reveal";
type RevealStep = "dim" | "flip-dragon" | "flip-tiger" | "clash" | "settle" | "idle";
type MoneyState = "none" | "staked" | "settled";

interface Sprite { id: number; v: number; x: number; y: number }
interface Outcome { winner: DtZone; dragonCard: DtCard; tigerCard: DtCard }
interface ServerResult extends Outcome {
  roundId: string;
  totalStaked: number;
  payout: number;
  profit: number;
  won: boolean;
  newBalance: number;
}

// ─── Zone presentation ────────────────────────────────────────────────────────

const ZONE_META: Record<DtZone, { label: string; odds: string; panel: string; text: string; mark?: string }> = {
  dragon: {
    label: "Dragon", odds: "1:1", text: "text-blue-100",
    panel: "from-[#2a2e8f]/90 via-[#1e2464]/90 to-[#151a49]/95 border-blue-300/40",
    mark: A("dragon-mark.webp"),
  },
  tie: {
    label: "Tie", odds: "8:1", text: "text-emerald-50",
    panel: "from-[#1d9e50]/90 via-[#157a3d]/90 to-[#0e5a2c]/95 border-emerald-200/40",
  },
  tiger: {
    label: "Tiger", odds: "1:1", text: "text-amber-100",
    panel: "from-[#b97709]/90 via-[#8f5606]/90 to-[#6b3f05]/95 border-amber-200/45",
    mark: A("tiger-mark.webp"),
  },
};

const MAX_SPRITES_PER_ZONE = 40;
const BIG_WIN_PAYOUT = 5000;

// ─── Formatting ───────────────────────────────────────────────────────────────

const fmtPKR = (n: number) =>
  n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Tiny components ──────────────────────────────────────────────────────────

// Count-up display. Restarts from the CURRENTLY SHOWN value (not the previous
// target) so back-to-back balance changes glide instead of snapping.
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  useEffect(() => {
    const from = displayRef.current;
    if (from === value) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (value - from) * eased;
      displayRef.current = v;
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmtPKR(display)}</>;
}

// Programmatic card face (shared deck data — no card-face images).
function DtCardFace({ card }: { card: DtCard }) {
  const suit = SUITS[card.suit];
  return (
    <div className="relative h-full w-full overflow-hidden rounded-md bg-gradient-to-b from-white to-[#f2ece2] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
      {/* Fonts scale with the card, which scales with BOTH viewport axes */}
      <div className="absolute left-[7%] top-[3%] flex flex-col items-center font-bp-mono font-black leading-none" style={{ color: suit.color }}>
        <span className="text-[min(clamp(9px,1.8vh,16px),2.6vw)]">{RANK_LABEL[card.rank]}</span>
        <span className="text-[min(clamp(8px,1.6vh,15px),2.4vw)]">{suit.glyph}</span>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center font-bp-mono" style={{ color: suit.color }}>
        <span className="font-black leading-none text-[min(clamp(19px,4.8vh,46px),6vw)]">{RANK_LABEL[card.rank]}</span>
        <span className="leading-none text-[min(clamp(14px,3.4vh,34px),4.4vw)]">{suit.glyph}</span>
      </div>
    </div>
  );
}

// `instant` snaps the flip (used at round reset so the face never un-flips blank).
// Card size follows viewport HEIGHT as well as width, so short-but-wide windows
// (laptops with devtools, 600px-tall tablets) never overflow the stage.
function FlipSlot({ card, flipped, glow, instant }: { card: DtCard | null; flipped: boolean; glow: boolean; instant: boolean }) {
  return (
    <div className="aspect-[54/74] h-[min(clamp(70px,19vh,184px),24vw)]" style={{ perspective: 900 }}>
      <div
        className={`relative h-full w-full ease-in-out ${instant ? "" : "transition-transform duration-[600ms]"}`}
        style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={A("card-back.webp")} alt="" draggable={false}
          className="absolute inset-0 h-full w-full rounded-md object-cover shadow-[0_6px_18px_rgba(0,0,0,0.55)]"
          style={{ backfaceVisibility: "hidden" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: "hidden", transform: "rotateY(180deg)",
            filter: glow ? "drop-shadow(0 0 14px rgba(245,182,10,0.85))" : "drop-shadow(0 6px 14px rgba(0,0,0,0.5))",
          }}
        >
          {card && <DtCardFace card={card} />}
        </div>
      </div>
    </div>
  );
}

const HEX_CLIP = "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)";

function HistoryBadge({ zone, latest }: { zone: DtZone; latest: boolean }) {
  if (zone === "tie") {
    return (
      <span className="relative flex h-[18px] shrink-0 items-center rounded-full border border-emerald-300/60 bg-emerald-500/85 px-1.5 text-[8px] font-black text-white md:h-[22px] md:text-[10px] lg:h-6 lg:px-2 lg:text-[11px]">
        Tie
        {latest && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.9)] lg:h-2 lg:w-2" />}
      </span>
    );
  }
  const dragon = zone === "dragon";
  return (
    <span className="relative shrink-0">
      <span
        className={`flex h-[18px] w-[18px] items-center justify-center text-[9px] font-black text-white md:h-[22px] md:w-[22px] md:text-[11px] lg:h-6 lg:w-6 lg:text-[12px] ${dragon ? "bg-blue-600" : "bg-amber-600"}`}
        style={{ clipPath: HEX_CLIP }}
      >
        {dragon ? "D" : "T"}
      </span>
      {latest && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.9)] lg:h-2 lg:w-2" />}
    </span>
  );
}

function RosterSlot({ bot, crowned, side }: { bot: DtBot; crowned: boolean; side: "left" | "right" }) {
  return (
    <div className={`flex flex-col ${side === "left" ? "items-start" : "items-end"} gap-0.5`}>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={AVATAR_IMG(bot.avatarIdx)} alt="" draggable={false}
          className="aspect-square h-[min(clamp(30px,6vh,56px),9vw)] rounded-full border border-amber-300/70 object-cover shadow-[0_2px_8px_rgba(0,0,0,0.6)] md:border-2"
        />
        {crowned && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={A("crown.webp")} alt="" draggable={false}
            className="absolute -left-2 -top-2.5 aspect-[4/3] h-[min(clamp(16px,3vh,32px),4.5vw)] -rotate-[24deg] object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
          />
        )}
      </div>
      <div className={`flex items-center gap-0.5 rounded-full bg-black/75 px-1.5 py-px lg:gap-1 lg:px-2 lg:py-0.5 ${side === "left" ? "" : "flex-row-reverse"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={A("coin.webp")} alt="" draggable={false} className="aspect-square h-[clamp(10px,1.8vh,16px)]" />
        <span className="font-bp-mono text-[8px] font-bold text-amber-200 md:text-[10px] lg:text-[12px]">
          {bot.balance.toLocaleString("en-PK", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
        </span>
      </div>
      <span className="max-w-[64px] truncate rounded bg-black/40 px-1 text-[7.5px] font-semibold text-white/75 md:max-w-[92px] md:text-[9px] lg:max-w-[120px] lg:text-[11px]">{bot.name}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DragonTigerGame({ initialBalance = 0, userName, avatarUrl }: { initialBalance?: number; userName?: string; avatarUrl?: string }) {
  // ── Core round state ──
  const [phase, setPhase] = useState<Phase>("betting");
  const [countdown, setCountdown] = useState(DT_BETTING_SECONDS);
  const [roundSeed, setRoundSeed] = useState(clockRound);
  const [waitingServer, setWaitingServer] = useState(false);
  const [locked, setLocked] = useState(false); // visual "Stop Betting" state
  const [revealStep, setRevealStep] = useState<RevealStep>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // ── Money ──
  const [balance, setBalance] = useState(initialBalance);
  const [bets, setBets] = useState<DtBets>(emptyDtBets);
  const [lastBets, setLastBets] = useState<DtBets | null>(null);
  const [moneyInRound, setMoneyInRound] = useState<MoneyState>("none");
  const [winFlash, setWinFlash] = useState<{ id: number; amount: number } | null>(null);

  // ── Table / crowd ──
  const [bots, setBots] = useState<DtBot[]>(() => makeRoster(clockRound()));
  const [botTotals, setBotTotals] = useState<DtBets>(emptyDtBets);
  const [sprites, setSprites] = useState<Record<DtZone, Sprite[]>>({ dragon: [], tie: [], tiger: [] });
  const [history, setHistory] = useState<DtZone[]>([]);

  // ── UI ──
  const [chipIdx, setChipIdx] = useState(2); // default chip: 100
  const [rackExpanded, setRackExpanded] = useState(false);
  const [trendOpen, setTrendOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [shakeZone, setShakeZone] = useState<DtZone | null>(null);

  // ── Refs (read inside rAF loops without re-subscribing) ──
  const betsRef = useRef(bets); betsRef.current = bets;
  const balanceRef = useRef(balance); balanceRef.current = balance;
  const lockedRef = useRef(false);
  const countdownOverRef = useRef(false);
  const outcomeRef = useRef<Outcome | null>(null);
  const serverResultRef = useRef<ServerResult | null>(null);
  const botEventsRef = useRef<DtBotEvent[]>([]);
  const botCursorRef = useRef(0);
  const spriteIdRef = useRef(0);
  const toastIdRef = useRef(0);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    const id = ++toastIdRef.current;
    setToast({ id, msg });
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 1900);
  }, []);

  const shake = useCallback((zone: DtZone) => {
    setShakeZone(zone);
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => setShakeZone(null), 420);
  }, []);

  // ── Sounds: bespoke set from /public/sounds/dragon-tiger + shared fallbacks ──
  const bgLoopRef = useRef<HTMLAudioElement | null>(null);
  const chipSfxRef = useRef<HTMLAudioElement | null>(null);
  const tickSfxRef = useRef<HTMLAudioElement | null>(null);
  const winSfxRef = useRef<HTMLAudioElement | null>(null);
  const lossSfxRef = useRef<HTMLAudioElement | null>(null);
  const dragonRoarRef = useRef<HTMLAudioElement | null>(null);
  const tigerRoarRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const cfg = getSoundSettings();
    const mk = (src: string, vol: number) => { const a = new Audio(src); a.volume = vol; return a; };
    bgLoopRef.current = mk(S("bg-loop.mp3"), cfg.bgMusic * 0.7);
    bgLoopRef.current.loop = true;
    chipSfxRef.current = mk(S("chip-place.mp3"), cfg.sfx * 0.7);
    tickSfxRef.current = mk("/sounds/button-click.mp3", cfg.sfx * 0.3);
    winSfxRef.current = mk("/sounds/win.mp3", cfg.sfx);
    lossSfxRef.current = mk("/sounds/loss.mp3", cfg.sfx * 0.8);
    dragonRoarRef.current = mk(S("dragon-roar.mp3"), cfg.sfx * 0.9);
    tigerRoarRef.current = mk(S("tiger-roar.mp3"), cfg.sfx * 0.9);

    // Autoplay policies block un-gestured audio — retry the loop on first tap.
    const tryBg = () => { bgLoopRef.current?.play().catch(() => { }); };
    tryBg();
    document.addEventListener("pointerdown", tryBg, { once: true });

    const off = onSoundSettingsChange((s) => {
      if (bgLoopRef.current) bgLoopRef.current.volume = s.bgMusic * 0.7;
      if (chipSfxRef.current) chipSfxRef.current.volume = s.sfx * 0.7;
      if (tickSfxRef.current) tickSfxRef.current.volume = s.sfx * 0.3;
      if (winSfxRef.current) winSfxRef.current.volume = s.sfx;
      if (lossSfxRef.current) lossSfxRef.current.volume = s.sfx * 0.8;
      if (dragonRoarRef.current) dragonRoarRef.current.volume = s.sfx * 0.9;
      if (tigerRoarRef.current) tigerRoarRef.current.volume = s.sfx * 0.9;
    });
    return () => {
      off();
      document.removeEventListener("pointerdown", tryBg);
      if (chipStopTimerRef.current) clearTimeout(chipStopTimerRef.current);
      for (const r of [bgLoopRef, chipSfxRef, tickSfxRef, winSfxRef, lossSfxRef, dragonRoarRef, tigerRoarRef]) r.current?.pause();
    };
  }, []);

  const play = (ref: React.MutableRefObject<HTMLAudioElement | null>) => {
    if (!ref.current) return;
    ref.current.currentTime = 0;
    ref.current.play().catch(() => { });
  };

  // Chip-place is a long clip: when an amount is added, play it ONCE (rapid taps
  // don't restart it) and hard-stop after ~1.2s so only the first clink is heard.
  const chipStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playChip = useCallback(() => {
    const a = chipSfxRef.current;
    if (!a || !a.paused) return;
    a.currentTime = 0;
    a.play().catch(() => { });
    if (chipStopTimerRef.current) clearTimeout(chipStopTimerRef.current);
    chipStopTimerRef.current = setTimeout(() => a.pause(), 1200);
  }, []);

  // ── Warm-up: compile/cold-start the round route + preload reveal-critical art
  //    so the first real round has neither a "Dealing…" hold nor a missing burst. ──
  useEffect(() => {
    fetch("/api/games/dragon-tiger").catch(() => { });
    for (const f of ["vs-burst.webp", "card-back.webp"]) {
      const img = new window.Image();
      img.src = A(f);
    }
  }, []);

  // ── Sprites ──
  const makeSprite = useCallback((v: number): Sprite => ({
    id: ++spriteIdRef.current,
    v,
    x: 8 + Math.random() * 74,
    y: 16 + Math.random() * 60,
  }), []);

  const addSprites = useCallback((additions: Array<{ zone: DtZone; v: number }>) => {
    if (additions.length === 0) return;
    setSprites((prev) => {
      const next = { ...prev };
      for (const { zone, v } of additions) {
        const arr = [...next[zone], makeSprite(v)];
        next[zone] = arr.length > MAX_SPRITES_PER_ZONE ? arr.slice(arr.length - MAX_SPRITES_PER_ZONE) : arr;
      }
      return next;
    });
  }, [makeSprite]);

  // ── Wallet refresh (deposit close / error reconciliation). The server wallet
  //    knows nothing about chips placed locally before the round locks, so any
  //    still-staked amount is re-subtracted from the fetched truth. ──
  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/summary", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBalance(Number(data.balance) - dtTotal(betsRef.current));
      }
    } catch { /* silent */ }
  }, []);

  // ── Round lock: send the player's book to the server (or arm a spectator round) ──
  const beginReveal = useCallback(() => {
    setOutcome(outcomeRef.current);
    setWaitingServer(false);
    setRevealStep("dim");
    setPhase("reveal");
  }, []);

  const armOutcome = useCallback((o: Outcome) => {
    outcomeRef.current = o;
    if (countdownOverRef.current) beginReveal();
  }, [beginReveal]);

  const lockRound = useCallback((seed: number) => {
    lockedRef.current = true;
    setLocked(true);
    const staked = { ...betsRef.current };
    const total = dtTotal(staked);
    if (total > 0) setLastBets(staked);

    if (total <= 0) {
      // Spectator round — no server call; natural odds keep the table alive.
      armOutcome(sampleNaturalDtOutcome(mulberry32(seed ^ 0x9e3779b9)));
      return;
    }

    // Hard timeout so a hung request can never freeze the table on "Dealing…".
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    fetch("/api/games/dragon-tiger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bets: staked }),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || data?.error) throw new Error(data?.error ?? "Bet failed");
        return data as ServerResult;
      })
      .then((result) => {
        serverResultRef.current = result;
        armOutcome({ winner: result.winner, dragonCard: result.dragonCard, tigerCard: result.tigerCard });
      })
      .catch((err: unknown) => {
        // Assume the server never debited: restore the local display and degrade to
        // spectator. In case the request actually DID settle (timeout after commit),
        // reconcile with the wallet truth shortly after.
        setBalance((b) => b + total);
        setBets(emptyDtBets());
        setMoneyInRound("none");
        serverResultRef.current = null;
        const aborted = err instanceof DOMException && err.name === "AbortError";
        showToast(aborted ? "Connection too slow — bet not placed" : err instanceof Error ? err.message : "Bet failed — round not placed");
        window.setTimeout(() => { void refreshBalance(); }, 1500);
        armOutcome(sampleNaturalDtOutcome(mulberry32(seed ^ 0x51ed1e9b)));
      })
      .finally(() => clearTimeout(timer));
  }, [armOutcome, showToast, refreshBalance]);

  // ── BETTING phase loop ──
  useEffect(() => {
    if (phase !== "betting") return;

    // Reset the table for the new round.
    setBets(emptyDtBets());
    setBotTotals(emptyDtBets());
    setSprites({ dragon: [], tie: [], tiger: [] });
    setOutcome(null);
    setRevealStep("idle");
    setWaitingServer(false);
    setLocked(false);
    setMoneyInRound("none");
    outcomeRef.current = null;
    serverResultRef.current = null;
    lockedRef.current = false;
    countdownOverRef.current = false;
    botEventsRef.current = makeBotEvents(roundSeed, bots.length);
    botCursorRef.current = 0;
    setCountdown(DT_BETTING_SECONDS);

    const start = performance.now();
    let raf = 0;
    let lastSecond = DT_BETTING_SECONDS + 1;

    const tick = (now: number) => {
      // Wall-clock — tab away and the table moves on (live-game behaviour).
      const elapsed = (now - start) / 1000;
      const left = Math.max(0, DT_BETTING_SECONDS - elapsed);

      const second = Math.max(1, Math.ceil(left)); // never flash "Start Betting 0"
      if (second !== lastSecond) {
        lastSecond = second;
        setCountdown(second);
        if (second <= 5 && !lockedRef.current) play(tickSfxRef);
      }

      // Bot chips trickle in.
      const events = botEventsRef.current;
      const additions: Array<{ zone: DtZone; v: number }> = [];
      const totalsDelta = emptyDtBets();
      while (botCursorRef.current < events.length && events[botCursorRef.current].at <= elapsed) {
        const e = events[botCursorRef.current++];
        additions.push({ zone: e.zone, v: e.amount });
        totalsDelta[e.zone] += e.amount;
      }
      if (additions.length > 0) {
        addSprites(additions);
        setBotTotals((prev) => ({
          dragon: prev.dragon + totalsDelta.dragon,
          tie: prev.tie + totalsDelta.tie,
          tiger: prev.tiger + totalsDelta.tiger,
        }));
      }

      if (left <= DT_BETS_LOCK_SECONDS && !lockedRef.current) lockRound(roundSeed);

      if (left <= 0) {
        countdownOverRef.current = true;
        if (outcomeRef.current) beginReveal();
        else setWaitingServer(true); // server response still in flight — brief hold
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, roundSeed, bots.length, addSprites, lockRound, beginReveal]);

  // ── REVEAL phase loop (Free Time) ──
  useEffect(() => {
    if (phase !== "reveal") return;
    const o = outcomeRef.current;
    if (!o) { setPhase("betting"); return; }

    const start = performance.now();
    let raf = 0;
    let lastSecond = DT_FREE_SECONDS + 1;
    let settled = false;
    let historyDone = false;
    let advanced = false;

    const stepFor = (t: number): RevealStep =>
      t < 0.4 ? "dim" :
        t < 1.0 ? "flip-dragon" :
          t < 1.6 ? "flip-tiger" :
            t < 2.8 ? "clash" :
              t < 4.4 ? "settle" : "idle";

    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const left = Math.max(0, DT_FREE_SECONDS - elapsed);

      const second = Math.max(1, Math.ceil(left));
      if (second !== lastSecond) { lastSecond = second; setCountdown(second); }

      setRevealStep((prev) => {
        const next = stepFor(elapsed);
        return prev === next ? prev : next;
      });

      // Settlement — apply exactly once. When the tab was hidden through the
      // celebration window (rAF paused, wall-clock jumped), apply the money
      // silently: confetti/sounds over the NEXT round's table would be wrong.
      if (!settled && elapsed >= 2.8) {
        settled = true;
        const lateCatchUp = elapsed > 4.6;
        const result = serverResultRef.current;
        if (result) {
          setBalance(result.newBalance);
          setMoneyInRound("settled");
          if (!lateCatchUp) {
            if (result.profit > 0) {
              play(winSfxRef);
              hapticWin();
              fireWinConfetti();
              if (result.payout >= BIG_WIN_PAYOUT) {
                window.setTimeout(fireWinConfetti, 350);
                window.setTimeout(fireWinConfetti, 700);
              }
              setWinFlash({ id: Date.now(), amount: result.payout });
              window.setTimeout(() => setWinFlash(null), 1800);
            } else if (result.profit < 0) {
              play(lossSfxRef);
              hapticLoss();
            }
            // profit === 0 (perfect hedge push): the stake came back — stay neutral.
          }
        }
        // Cosmetic bot settlement drift + roster re-rank.
        const consumed = botEventsRef.current.slice(0, botCursorRef.current);
        const byBot = sumEventsByBot(consumed);
        if (byBot.size > 0) {
          setBots((prev) => prev.map((b) => {
            const bb = byBot.get(b.id);
            if (!bb) return b;
            const delta = dtReturn(bb, o.winner) - dtTotal(bb);
            return { ...b, balance: Math.max(120, Math.round((b.balance + delta) * 100) / 100) };
          }));
        }
      }

      if (!historyDone && elapsed >= 4.5) {
        historyDone = true;
        setHistory((h) => [...h, o.winner].slice(-60));
      }

      if (elapsed >= DT_FREE_SECONDS) {
        if (!advanced) {
          advanced = true;
          setRoundSeed((s) => s + 1);
          setPhase("betting");
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Step-transition sounds: card-flip clicks + the winner's roar at the clash.
  const prevStepRef = useRef<RevealStep>("idle");
  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = revealStep;
    if (prev === revealStep) return;
    if (revealStep === "flip-dragon" || revealStep === "flip-tiger") play(tickSfxRef);
    if (revealStep === "clash") {
      const w = outcomeRef.current?.winner;
      if (w === "dragon") play(dragonRoarRef);
      else if (w === "tiger") play(tigerRoarRef);
    }
  }, [revealStep]);

  // ── Betting interactions ──
  const placeChip = useCallback((zone: DtZone) => {
    if (phase !== "betting" || lockedRef.current) { showToast("Bets are closed"); return; }
    const v = DT_CHIP_VALUES[chipIdx];
    const total = dtTotal(betsRef.current);
    if (total + v > DT_MAX_TOTAL) { shake(zone); showToast(`Max PKR ${DT_MAX_TOTAL.toLocaleString("en-PK")} per round`); return; }
    if (v > balanceRef.current) { setDepositOpen(true); return; }
    setBalance((b) => b - v);
    setBets((prev) => ({ ...prev, [zone]: prev[zone] + v }));
    setMoneyInRound("staked");
    addSprites([{ zone, v }]);
    playChip();
    hapticTap();
  }, [phase, chipIdx, addSprites, showToast, shake, playChip]);

  // Continue = re-place last round's full layout (reference behaviour).
  const continueBet = useCallback(() => {
    if (phase !== "betting" || lockedRef.current) { showToast("Bets are closed"); return; }
    if (!lastBets || dtTotal(lastBets) <= 0) { showToast("No previous bet to repeat"); return; }
    const total = dtTotal(lastBets);
    if (dtTotal(betsRef.current) + total > DT_MAX_TOTAL) { showToast(`Max PKR ${DT_MAX_TOTAL.toLocaleString("en-PK")} per round`); return; }
    if (total > balanceRef.current) { setDepositOpen(true); return; }
    setBalance((b) => b - total);
    setBets((prev) => ({
      dragon: prev.dragon + lastBets.dragon,
      tie: prev.tie + lastBets.tie,
      tiger: prev.tiger + lastBets.tiger,
    }));
    setMoneyInRound("staked");
    addSprites(DT_ZONES.filter((z) => lastBets[z] > 0).map((z) => ({ zone: z, v: lastBets[z] })));
    playChip();
    hapticTap();
  }, [phase, lastBets, addSprites, showToast, playChip]);

  // ── Derived ──
  const zoneTotals = useMemo<DtBets>(() => ({
    dragon: botTotals.dragon + bets.dragon,
    tie: botTotals.tie + bets.tie,
    tiger: botTotals.tiger + bets.tiger,
  }), [botTotals, bets]);

  // Rate bar: dragon's share of the round's D+T money; holds its last value while
  // the table is empty (derived in render — no extra state/effect double-render).
  const rateShareRef = useRef(0.5);
  const dMoney = zoneTotals.dragon, tMoney = zoneTotals.tiger;
  const rateShare = dMoney + tMoney > 0 ? dMoney / (dMoney + tMoney) : rateShareRef.current;
  rateShareRef.current = rateShare;

  const rankedBots = useMemo(() => [...bots].sort((a, b) => b.balance - a.balance), [bots]);
  const leftRoster = rankedBots.slice(0, 3);
  const rightRoster = rankedBots.slice(3, 6);

  const winner = outcome?.winner ?? null;
  const showResult = phase === "reveal" && (revealStep === "settle" || revealStep === "idle");
  const collecting = phase === "reveal" && revealStep === "idle"; // payout flight window
  const clashing = phase === "reveal" && revealStep === "clash";
  const dragonFlipped = phase === "reveal" && revealStep !== "dim";
  const tigerFlipped = phase === "reveal" && revealStep !== "dim" && revealStep !== "flip-dragon";

  const bannerText = phase === "betting"
    ? (waitingServer ? "Dealing…" : locked ? "Stop Betting" : `Start Betting ${countdown}`)
    : `Free Time ${countdown}`;
  const bannerUrgent = phase === "betting" && !locked && !waitingServer && countdown <= 5;

  const historyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [history]);

  const trendCounts = useMemo(() => {
    const c = { dragon: 0, tie: 0, tiger: 0 };
    for (const z of history) c[z]++;
    return c;
  }, [history]);

  // Bots' current-round stakes, shown in the players drawer (computed on demand).
  const roundBetsByBot = playersOpen
    ? sumEventsByBot(botEventsRef.current.slice(0, botCursorRef.current))
    : null;

  const visibleChips = rackExpanded ? DT_CHIP_VALUES : DT_CHIP_VALUES.slice(0, 5);
  // Same avatar concept as the Profile page (rounded-square, amber-tinted,
  // single-initial fallback) so the player recognises themselves across the app.
  const playerInitial = (userName?.trim()?.[0] ?? "Y").toUpperCase();

  // Hero clash transforms — the lunge has to read on a wide desktop stage.
  // Bottom-anchored so the creatures stand on the arena floor (no dead band under
  // them); pulled inward on wide screens so the centre never looks empty.
  const heroCls = (side: "dragon" | "tiger") => {
    const base = "pointer-events-none absolute bottom-[2%] h-[78%] max-w-[42%] object-contain object-bottom transition-all duration-700";
    const pos = side === "dragon" ? "left-[2%] md:left-[4%] xl:left-[9%]" : "right-[2%] md:right-[4%] xl:right-[9%]";
    if (!clashing && !showResult) return `${base} ${pos} dt-float`;
    if (winner === "tie") return `${base} ${pos} ${side === "dragon" ? "translate-x-[22%]" : "-translate-x-[22%]"} brightness-110`;
    if (winner === side) return `${base} ${pos} ${side === "dragon" ? "translate-x-[55%]" : "-translate-x-[55%]"} scale-[1.18] brightness-125 z-[15]`;
    return `${base} ${pos} opacity-40 saturate-50`;
  };

  return (
    <>
      <style>{`
        @keyframes dt-float-kf { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        .dt-float { animation: dt-float-kf 5.5s ease-in-out infinite }
        @keyframes dt-chip-in {
          0% { transform: translate(-6px, 110px) scale(.45); opacity: 0 }
          55% { opacity: 1 }
          100% { transform: none; opacity: 1 }
        }
        @keyframes dt-rise { 0% { transform: translateY(0); opacity: 1 } 100% { transform: translateY(-70px); opacity: 0 } }
        @keyframes dt-burst { 0% { transform: scale(.4); opacity: 0 } 20% { opacity: 1 } 100% { transform: scale(1.8); opacity: 0 } }
        @keyframes dt-sweep { to { transform: translateY(44px); opacity: 0 } }
        @keyframes dt-collect { to { transform: translate(-34vw, 26vh) scale(.35); opacity: 0 } }
        @keyframes dt-glow { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
        @keyframes dt-shake-kf {
          0%,100% { transform: translateX(0) } 20% { transform: translateX(-7px) }
          40% { transform: translateX(6px) } 60% { transform: translateX(-4px) } 80% { transform: translateX(3px) }
        }
        .dt-shake { animation: dt-shake-kf .38s ease }
      `}</style>

      <GamesNativeWrapper
        balance={balance}
        name="Dragon vs Tiger"
        subtitle="Live · Cards"
        gameType="dragon-tiger"
        isPlaying={moneyInRound === "staked"}
        onDepositClose={refreshBalance}
      >
        <section className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          {/* Toast */}
          {toast && (
            <div className="pointer-events-none absolute left-1/2 top-[42%] z-[70] -translate-x-1/2">
              <div className="whitespace-nowrap rounded-2xl border border-bp-accent/30 bg-black/85 px-4 py-2 text-[12px] font-bold text-bp-accent shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-sm lg:px-6 lg:py-2.5 lg:text-[15px]">
                {toast.msg}
              </div>
            </div>
          )}

          {/* ── STAGE — capped on narrow portrait so it can't balloon ── */}
          <div className="relative max-h-[130vw] min-h-[150px] flex-1 overflow-hidden sm:max-h-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={A("bg-table.webp")} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover object-center" />
            <div className="absolute inset-0 bg-black/20" />

            {/* Cosmetic build/round overlay (reference top-left text) */}
            <div className="absolute left-2 top-1.5 z-10 font-bp-mono text-[8px] leading-tight text-red-300/60 md:text-[9px] lg:text-[11px]">
              <div>version 1.0.0</div>
              <div>ID:DT-{roundSeed}</div>
            </div>

            {/* Heroes */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={A("dragon-hero.webp")} alt="" draggable={false} className={heroCls("dragon")} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={A("tiger-hero.webp")} alt="" draggable={false} className={heroCls("tiger")} />

            {/* Clash burst — duration matches the full 1.2s clash window */}
            {clashing && winner !== "tie" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={A("vs-burst.webp")} alt="" draggable={false}
                className="pointer-events-none absolute left-1/2 top-[16%] z-20 h-[46%] -translate-x-1/2 object-contain"
                style={{ animation: "dt-burst 1.25s ease-out forwards" }}
              />
            )}
            {clashing && winner === "tie" && (
              <div
                className="pointer-events-none absolute inset-0 z-20"
                style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(16,185,129,0.5) 0%, transparent 65%)", animation: "dt-burst 1.25s ease-out forwards" }}
              />
            )}

            {/* Cards + VS + phase banner */}
            <div className="absolute inset-x-0 top-[4%] z-10 flex flex-col items-center gap-1.5 md:gap-2">
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4 lg:gap-5">
                <FlipSlot card={outcome?.dragonCard ?? null} flipped={dragonFlipped} glow={showResult && winner === "dragon"} instant={phase === "betting"} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={A("vs-emblem.webp")} alt="VS" draggable={false} className="aspect-square h-[min(clamp(34px,11vh,108px),14vw)] object-contain" />
                <FlipSlot card={outcome?.tigerCard ?? null} flipped={tigerFlipped} glow={showResult && winner === "tiger"} instant={phase === "betting"} />
              </div>
              <div className={`whitespace-nowrap rounded-md border border-amber-300/60 bg-gradient-to-b from-[#3a2c10]/95 to-[#1a1206]/95 px-4 py-1 font-black tracking-wide text-amber-100 shadow-[0_2px_10px_rgba(0,0,0,0.5)] text-[min(clamp(11px,2.2vh,17px),3vw)] md:px-5 lg:px-7 ${bannerUrgent ? "animate-pulse border-red-400/70 text-red-200" : ""}`}>
                {bannerText}
              </div>
              {showResult && winner && (
                <div className={`whitespace-nowrap rounded-full px-3 py-0.5 font-black uppercase tracking-widest text-[min(clamp(10px,2vh,16px),2.8vw)] md:px-4 lg:px-5 ${winner === "dragon" ? "bg-blue-600/85 text-white" : winner === "tiger" ? "bg-amber-600/90 text-white" : "bg-emerald-600/90 text-white"}`}
                  style={{ animation: "dt-chip-in .35s ease-out" }}>
                  {winner === "tie" ? "Tie!" : `${ZONE_META[winner].label} Wins!`}
                </div>
              )}
            </div>

            {/* Win flash */}
            {winFlash && (
              <div key={winFlash.id} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" style={{ animation: "dt-rise 1.8s ease-out forwards" }}>
                <span className="rounded-2xl border border-amber-300/50 bg-amber-500/20 px-5 py-2 font-bp-mono text-2xl font-black text-amber-200 shadow-[0_0_32px_rgba(245,182,10,0.5)] backdrop-blur-sm lg:px-8 lg:py-3 lg:text-4xl">
                  +PKR {fmtPKR(winFlash.amount)}
                </span>
              </div>
            )}

            {/* Side rosters — height-capped and clipped inside the stage; the third
                slot yields entirely on short viewports so nothing spills */}
            <div className="absolute bottom-1 left-1 top-[clamp(30px,7vh,64px)] z-10 flex flex-col gap-1.5 overflow-hidden sm:left-2 md:gap-2.5 lg:left-3">
              {leftRoster.map((b, i) => (
                <div key={b.id} className={i === 2 ? "[@media(max-height:800px)]:hidden" : undefined}>
                  <RosterSlot bot={b} crowned={i === 0} side="left" />
                </div>
              ))}
            </div>
            <div className="absolute bottom-1 right-1 top-[clamp(30px,7vh,64px)] z-10 flex flex-col gap-1.5 overflow-hidden sm:right-2 md:gap-2.5 lg:right-3">
              {rightRoster.map((b, i) => (
                <div key={b.id} className={i === 2 ? "[@media(max-height:800px)]:hidden" : undefined}>
                  <RosterSlot bot={b} crowned={i === 0} side="right" />
                </div>
              ))}
            </div>
          </div>

          {/* ── HISTORY BAR ── */}
          <div className="flex h-8 shrink-0 items-center gap-1.5 border-y border-white/[0.06] bg-[#160f2b]/90 px-2 md:h-9 lg:h-10 lg:gap-2 lg:px-3">
            <button
              type="button"
              onClick={() => { setPlayersOpen(true); }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-300/50 bg-gradient-to-b from-emerald-500 to-emerald-700 text-white shadow-[0_2px_6px_rgba(0,0,0,0.5)] active:scale-95 md:h-7 md:w-7 lg:h-8 lg:w-8"
              aria-label="Live players"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 lg:h-[18px] lg:w-[18px]" fill="currentColor"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z" /></svg>
            </button>
            <div ref={historyRef} className="flex flex-1 items-center gap-1 overflow-x-auto lg:gap-1.5" style={{ scrollbarWidth: "none" }}>
              {history.length === 0 ? (
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/25 lg:text-[11px]">First round — place your bets</span>
              ) : (
                history.slice(-30).map((z, i, arr) => (
                  <HistoryBadge key={history.length - arr.length + i} zone={z} latest={i === arr.length - 1} />
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => setTrendOpen(true)}
              className="flex h-6 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-300/40 bg-blue-600/80 text-white active:scale-95 md:h-7 md:w-9 lg:h-8 lg:w-10"
              aria-label="Trends"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 lg:h-[18px] lg:w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 17l5-6 4 3 7-9" /></svg>
            </button>
          </div>

          {/* ── BET ZONES — height scales with the viewport like the reference table ── */}
          <div className="grid h-[clamp(112px,15vh,150px)] shrink-0 grid-cols-[1fr_0.82fr_1fr] gap-1.5 px-2 pt-1.5 sm:h-[clamp(140px,30vh,320px)] sm:gap-2 sm:px-3 lg:h-[clamp(150px,30vh,400px)] lg:gap-3 lg:px-4">
            {DT_ZONES.map((zone) => {
              const meta = ZONE_META[zone];
              const total = zoneTotals[zone];
              const own = bets[zone];
              const isWinner = showResult && winner === zone;
              const isLoser = showResult && winner !== null && winner !== zone;
              return (
                <button
                  key={zone}
                  type="button"
                  onClick={() => placeChip(zone)}
                  className={`relative h-full overflow-hidden rounded-2xl border bg-gradient-to-b text-left transition-all duration-500 ${meta.panel}
                    ${phase === "reveal" ? "pointer-events-none" : locked ? "pointer-events-none brightness-[.8] saturate-[.85]" : "active:scale-[0.99]"}
                    ${isLoser ? "opacity-50 saturate-50" : ""}
                    ${shakeZone === zone ? "dt-shake" : ""}
                    ${isWinner ? "ring-2 ring-amber-400/90" : ""}`}
                >
                  {/* Winner glow — GPU-cheap opacity pulse that lasts the whole result window */}
                  {isWinner && (
                    <div
                      className="pointer-events-none absolute inset-0 rounded-2xl"
                      style={{
                        boxShadow: "0 0 36px rgba(245,182,10,0.6), inset 0 0 24px rgba(245,182,10,0.28)",
                        animation: "dt-glow 1.1s ease-in-out infinite",
                      }}
                    />
                  )}
                  {/* Watermark */}
                  {meta.mark && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={meta.mark} alt="" draggable={false} className="pointer-events-none absolute bottom-0 left-1/2 h-[86%] -translate-x-1/2 object-contain opacity-30" />
                  )}
                  {/* Zone total strip */}
                  {total > 0 && (
                    <div className="absolute inset-x-0 top-0 z-[6] bg-black/45 py-0.5 text-center font-bp-mono text-[10px] font-bold text-white/90 sm:text-[11px] md:text-[13px] lg:py-1 lg:text-[16px]">
                      {total.toFixed(2)}
                    </div>
                  )}
                  {/* Label — above the chip sprites so it stays readable */}
                  <div className={`absolute inset-x-0 z-[5] ${zone === "tie" ? "top-[32%]" : "bottom-[18%]"} pointer-events-none flex flex-col items-center ${meta.text}`}>
                    <span className="text-lg font-black leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] sm:text-xl md:text-3xl lg:text-4xl xl:text-5xl">{meta.label}</span>
                    <span className="text-[11px] font-bold opacity-90 sm:text-[12px] md:text-[15px] lg:text-[18px]">{meta.odds}</span>
                  </div>
                  {/* Chip sprites: fly in from the rack side, sweep away on loss,
                      fly off toward the player when the zone pays out */}
                  <div className="pointer-events-none absolute inset-0">
                    {sprites[zone].map((s) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={s.id}
                        src={CHIP_IMG(spriteChip(s.v))}
                        alt=""
                        draggable={false}
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                        className="absolute h-6 w-6 drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)] sm:h-7 sm:w-7 md:h-9 md:w-9 lg:h-11 lg:w-11 xl:h-12 xl:w-12"
                        style={{
                          left: `${s.x}%`, top: `${s.y}%`,
                          animation: isLoser
                            ? "dt-sweep .6s ease-in forwards"
                            : isWinner && collecting
                              ? "dt-collect .8s ease-in forwards"
                              : "dt-chip-in .45s cubic-bezier(.2,.7,.3,1)",
                        }}
                      />
                    ))}
                  </div>
                  {/* Player's own stake pill */}
                  {own > 0 && (
                    <div className="absolute bottom-1 left-1/2 z-[6] -translate-x-1/2 rounded-full border border-amber-200/70 bg-black/65 px-2 py-px font-bp-mono text-[10px] font-black text-amber-300 md:bottom-2 md:px-3 md:py-0.5 md:text-[13px] lg:px-4 lg:py-1 lg:text-[16px]">
                      {own.toFixed(2)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── RATE BAR ── */}
          <div className="flex shrink-0 items-center justify-center gap-2 py-0.5 lg:py-1">
            <div className="flex items-center gap-2 rounded-full border border-amber-200/25 bg-[#171033]/90 px-3 py-1 lg:gap-3 lg:px-5 lg:py-1.5">
              <span className="text-[10px] text-amber-300 lg:text-[13px]">★</span>
              <span className="font-bp-mono text-[10px] font-bold text-white/85 md:text-[11px] lg:text-[14px]">
                Rate:{Math.round(Math.max(rateShare, 1 - rateShare) * 100)}%
              </span>
              <span className={`text-[10px] font-black lg:text-[13px] ${rateShare >= 0.5 ? "text-blue-400" : "text-white/30"}`}>D</span>
              <div className="relative h-1.5 w-20 rounded-full bg-gradient-to-r from-blue-600/70 via-white/10 to-amber-500/70 sm:w-24 md:w-32 lg:h-2 lg:w-48">
                <span
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-400 shadow-[0_0_6px_rgba(245,182,10,0.9)] transition-[left] duration-500 lg:h-4 lg:w-4"
                  style={{ left: `${(1 - rateShare) * 100}%` }}
                />
              </div>
              <span className={`text-[10px] font-black lg:text-[13px] ${rateShare < 0.5 ? "text-amber-400" : "text-white/30"}`}>T</span>
            </div>
          </div>

          {/* ── BOTTOM BAR ── */}
          <div className="flex shrink-0 items-center gap-2 px-2 pb-1.5 pt-0.5 sm:px-3" style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}>
            {/* Player avatar + balance — same rounded-square/amber avatar concept as
                the Profile page (real photo when set, else a single-letter initial) */}
            <div className="flex shrink-0 items-center gap-1.5 lg:gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border-2 border-amber-300/80 bg-amber-500/[0.12] shadow-[0_2px_8px_rgba(0,0,0,0.6)] lg:h-12 lg:w-12">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" draggable={false} className="h-full w-full object-cover" />
                ) : (
                  <span className="font-bp-mono text-[15px] font-black text-amber-300 lg:text-[20px]">{playerInitial}</span>
                )}
              </div>
              <div className="leading-none">
                {userName && <div className="mb-0.5 max-w-[72px] truncate text-[8px] font-semibold text-white/45 lg:max-w-[130px] lg:text-[11px]">{userName}</div>}
                <div className="font-bp-mono text-[13px] font-black text-white md:text-[14px] lg:text-[18px]">
                  <AnimatedNumber value={balance} />
                </div>
              </div>
            </div>

            {/* Chip rack */}
            <div className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto py-0.5 sm:gap-1.5" style={{ scrollbarWidth: "none" }}>
              {visibleChips.map((v) => {
                const idx = DT_CHIP_VALUES.indexOf(v);
                const selected = idx === chipIdx;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setChipIdx(idx); play(tickSfxRef); }}
                    className={`relative shrink-0 rounded-full transition-all ${selected ? "-translate-y-1 scale-110" : "opacity-85 hover:opacity-100"}`}
                    aria-label={`Chip ${v}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={CHIP_IMG(v)} alt={`${v}`} draggable={false}
                      className="h-10 w-10 sm:h-11 sm:w-11 md:h-[52px] md:w-[52px] lg:h-[62px] lg:w-[62px] xl:h-[68px] xl:w-[68px]"
                      style={selected ? { filter: "drop-shadow(0 0 8px rgba(245,182,10,0.9))" } : undefined}
                    />
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setRackExpanded((v) => !v)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-200/40 bg-[#2a1f4d] text-amber-200 active:scale-95 lg:h-10 lg:w-10"
                aria-label={rackExpanded ? "Fewer chips" : "More chips"}
              >
                <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform lg:h-5 lg:w-5 ${rackExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>

            {/* Continue (re-bet) */}
            <button
              type="button"
              onClick={continueBet}
              className="shrink-0 rounded-full border border-orange-300/50 bg-gradient-to-b from-orange-500 to-orange-700 px-4 py-2 text-[12px] font-black uppercase tracking-wide text-white shadow-[0_3px_12px_rgba(234,88,12,0.45)] active:scale-95 sm:px-5 md:px-7 md:py-2.5 md:text-[13px] lg:px-9 lg:py-3 lg:text-[16px]"
            >
              Continue
            </button>
          </div>
        </section>

        {/* ── Trend modal (mounted only while open) ── */}
        {trendOpen && (
          <GameModal open onClose={() => setTrendOpen(false)} variant="info" title="Round Trends">
            <div className="space-y-4 bg-bp-bg p-4">
              <div className="flex items-center justify-around">
                {DT_ZONES.map((z) => (
                  <div key={z} className="flex flex-col items-center gap-1">
                    <HistoryBadge zone={z} latest={false} />
                    <span className="font-bp-mono text-[13px] font-black text-white/85">{trendCounts[z]}</span>
                    <span className="text-[9px] uppercase tracking-wider text-white/35">
                      {history.length > 0 ? `${Math.round((trendCounts[z] / history.length) * 100)}%` : "0%"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5">
                {history.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-white/30">No rounds yet — trends fill in as the table plays.</div>
                ) : (
                  <div className="grid grid-flow-col grid-rows-6 justify-start gap-1 overflow-x-auto pb-1">
                    {history.map((z, i) => (
                      <span
                        key={i}
                        className={`flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-black text-white ${z === "dragon" ? "bg-blue-600" : z === "tiger" ? "bg-amber-600" : "bg-emerald-600"}`}
                      >
                        {z === "dragon" ? "D" : z === "tiger" ? "T" : "•"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-center text-[9px] uppercase tracking-[0.18em] text-white/25">Last {history.length} rounds · payouts D 1:1 · T 1:1 · Tie 8:1</p>
            </div>
          </GameModal>
        )}

        {/* ── Live players modal (mounted only while open) ── */}
        {playersOpen && (
          <GameModal open onClose={() => setPlayersOpen(false)} variant="info" title="Live Players">
            <div className="bg-bp-bg">
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-bp-mid px-4 py-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">{bots.length + 1} playing</span>
                <span className="font-bp-mono text-[11px] font-bold text-amber-300">
                  Table total {(zoneTotals.dragon + zoneTotals.tie + zoneTotals.tiger).toFixed(2)}
                </span>
              </div>
              <div className="max-h-[46vh] divide-y divide-white/[0.04] overflow-y-auto">
                {rankedBots.map((b, i) => {
                  const bb = roundBetsByBot?.get(b.id);
                  const roundTotal = bb ? dtTotal(bb) : 0;
                  return (
                    <div key={b.id} className="flex items-center gap-2.5 px-4 py-2">
                      <span className="w-4 text-right font-bp-mono text-[10px] text-white/25">{i + 1}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={AVATAR_IMG(b.avatarIdx)} alt="" draggable={false} className="h-7 w-7 rounded-full border border-white/15 object-cover" />
                      <span className="flex-1 truncate text-[12px] font-semibold text-white/75">{b.name}</span>
                      {roundTotal > 0 && (
                        <span className="rounded-full border border-emerald-300/30 bg-emerald-500/15 px-1.5 py-px font-bp-mono text-[9px] font-bold text-emerald-300">
                          bet {roundTotal.toLocaleString("en-PK")}
                        </span>
                      )}
                      <span className="font-bp-mono text-[11px] font-bold text-amber-200">
                        {b.balance.toLocaleString("en-PK", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </GameModal>
        )}
      </GamesNativeWrapper>

      <DepositSheet includePaddingBottom={false} open={depositOpen} onClose={async () => { setDepositOpen(false); await refreshBalance(); }} />
    </>
  );
}
