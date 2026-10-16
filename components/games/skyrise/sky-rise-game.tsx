"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BetCard, createBetCardState } from "./bet-card";
import { BoltIcon, UsersIcon } from "./icons";
import { LiveBetsPanel, randomBets } from "./live-bets-panel";
import { FlightCurve, MultiplierReadout, StarGridScene } from "./scene";
import type { CashoutTarget } from "./scene";
import type { BetCardState, BetId, PlayerBet, RoundPhase } from "./types";
import { getSoundSettings, onSoundSettingsChange } from "@/lib/sound-settings";
import { hapticTap, hapticLoss, hapticCashout } from "@/lib/haptics";
import { fireCashoutConfetti } from "@/lib/confetti";
import GamesNativeWrapper from "../games-native-wrapper";
import { DepositSheet } from "@/components/deposit-sheet";
import {
  POST_MS,
  phaseAt,
  roundAfter,
  roundAt,
  type SharedRound,
} from "@/lib/skyrise-sequence";
const ROUND_BETTING_SECONDS = 5;
// Bets close this long before launch (at the 4-second mark of the 5s window);
// the round request is prefetched in this window so the flight starts the
// moment the countdown bar empties. If the server is slower, the partner
// screen holds unchanged (bar at 0) until the response lands — one loader.
const BETS_LOCK_SECONDS = 1.0;
const ROUND_SPEED = 1;
const FLIGHT_GROWTH = 0.15; // exp coefficient: 2× at ~4.6s, 5× at ~10.7s

// ── Shared spectator rounds ───────────────────────────────────────────────────
// Rounds nobody has money on are now driven by lib/skyrise-sequence: a pure
// function of wall-clock time giving every device the same round number, the
// same phase boundaries and the same crash point. Two phones opened side by side
// fly the same plane, and the round monitor can show that crash because it
// derives it from the same clock rather than needing the browser to report it.
//
// A round with a real bet on it still diverges: the server decides that player's
// crash from their bet amount, targets and win-probability tier (unchanged), so
// their flight runs long or short and re-joins the shared clock afterwards —
// mid-flight if need be, since the flight tick is now wall-clock based.

function chipStyle(m: number) {
  if (m < 2) return "border-rose-500/40 bg-rose-500/[0.14] text-rose-400";
  if (m < 10) return "border-[#26c943]/40 bg-[#26c943]/[0.12] text-[#26c943]";
  return "border-violet-500/45 bg-violet-500/[0.14] text-violet-300";
}

function RoundHistoryBar({ history }: { history: number[] }) {
  if (history.length === 0) return null;
  return (
    <div className="absolute left-0 right-0 top-10 z-10 flex items-center justify-end gap-1 px-3 overflow-x-auto pointer-events-none" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}>
      {[...history].reverse().map((m, i, arr) => (
        <div
          key={i}
          className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-black whitespace-nowrap flex-shrink-0 backdrop-blur-sm ${chipStyle(m)}`}
          style={{ opacity: 1 - (arr.length - 1 - i) * 0.038 }}
        >
          {m.toFixed(2)}×
        </div>
      ))}
    </div>
  );
}

function CashoutFlash({ amount }: { amount: number }) {
  return (
    <>
      <style>{`
        @keyframes cf-bg { 0%{opacity:0.55} 35%{opacity:0.55} 100%{opacity:0} }
        @keyframes cf-rise { 0%{transform:translateY(0) scale(1);opacity:1} 100%{transform:translateY(-80px) scale(1.18);opacity:0} }
      `}</style>
      <div
        className="pointer-events-none absolute inset-0 z-30 rounded-[inherit]"
        style={{ background: "radial-gradient(ellipse at 50% 60%, rgba(16,185,129,0.28) 0%, transparent 70%)", animation: "cf-bg 1.3s ease-out forwards" }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
        style={{ animation: "cf-rise 1.3s ease-out forwards" }}
      >
        <span className="rounded-2xl border border-emerald-400/40 bg-emerald-500/20 px-5 py-2 font-mono text-2xl font-black text-emerald-300 shadow-[0_0_32px_rgba(16,185,129,0.45)] backdrop-blur-sm">
          +PKR {amount.toFixed(2)}
        </span>
      </div>
    </>
  );
}

// Decode a crashAt value that was XOR-encoded server-side using the roundId.
// The encoding prevents the plain multiplier from being visible in DevTools.
function decodeCrashAt(encoded: string | undefined, roundId: string): number | null {
  if (!encoded || !roundId) return null;
  try {
    const key = roundId.replace(/-/g, "");
    const pairs = encoded.match(/.{2}/g) ?? [];
    const decoded = pairs
      .map((hex, i) => String.fromCharCode(parseInt(hex, 16) ^ parseInt(key[i % key.length], 16)))
      .join("");
    const val = parseFloat(decoded);
    return Number.isFinite(val) && val > 1 && val <= 100 ? val : null;
  } catch {
    return null;
  }
}

function genCrashMultiplier(rng = Math.random) {
  const r = rng();
  if (r < 0.04) return Number((1 + Math.random() * 0.03).toFixed(2));
  const houseEdge = 0.03;
  const multiplier = (1 - houseEdge) / Math.max(0.0001, 1 - r);
  return Math.min(100, Number(multiplier.toFixed(2)));
}

function resolveAutoBet(state: BetCardState, balance: number): BetCardState {
  const reset = { ...state, cashedAt: null };
  // A manually-placed "Next Round" bet is already queued and its balance was
  // already deducted — carry it straight into the next round as-is.
  if (state.status === "queued") return reset;
  if (!state.autoBet) return { ...reset, status: "idle" };
  if (state.stopOnWinStreak && state.winStreak >= state.winStreakLimit) return { ...reset, status: "idle", autoBet: false };
  if (state.stopOnLossStreak && state.lossStreak >= state.lossStreakLimit) return { ...reset, status: "idle", autoBet: false };
  if (state.amount > balance) return { ...reset, status: "idle", autoBet: false };
  return { ...reset, status: "queued" };
}

export function SkyRiseGame({ initialBalance = 12500, userName }: { initialBalance?: number; userName?: string }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [phase, setPhase] = useState<RoundPhase>("betting");
  const [countdown, setCountdown] = useState(ROUND_BETTING_SECONDS);
  const [multiplier, setMultiplier] = useState(1);
  const [crashAt, setCrashAt] = useState(2);
  // Identical on every device — comes straight off the shared sequence.
  const [roundSeed, setRoundSeed] = useState(() => roundAt(Date.now()).roundNumber);
  const [balance, setBalance] = useState(initialBalance);

  const [betA, setBetA] = useState<BetCardState>(() => createBetCardState(100, true, 2));
  const [betB, setBetB] = useState<BetCardState>(() => createBetCardState(500, false, 3));
  const [liveBets, setLiveBets] = useState(() => randomBets(roundSeed));
  const [liveBetsVisible, setLiveBetsVisible] = useState(true);
  const [liveBetsCollapsed, setLiveBetsCollapsed] = useState(false);
  const [mobileBetsOpen, setMobileBetsOpen] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const [showBetB, setShowBetB] = useState(true);

  // ── Shared-clock plumbing ──────────────────────────────────────────────────
  // Device clocks drift by seconds, which on a ~20 s round is enough to put two
  // phones visibly out of phase, so everything below reads serverNow() rather
  // than Date.now(). Until the sync lands the offset is 0, i.e. the local clock
  // — close enough that the first round is never wrong by more than the drift.
  const skewRef = useRef(0);
  const serverNow = useCallback(() => Date.now() + skewRef.current, []);
  // The shared round this tab is currently playing out.
  const sharedRoundRef = useRef<SharedRound | null>(null);
  // Wall-clock instant the plane launched. The flight tick derives the
  // multiplier from this, so a tab that joins late (or returns from the
  // background) renders the flight already in progress instead of restarting it.
  const flightStartRef = useRef(0);

  const currentRound = useCallback((): SharedRound => {
    if (!sharedRoundRef.current) sharedRoundRef.current = roundAt(serverNow());
    return sharedRoundRef.current;
  }, [serverNow]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sentAt = Date.now();
        const res = await fetch("/api/time", { cache: "no-store" });
        if (!res.ok) return;
        const { now } = await res.json();
        if (cancelled || typeof now !== "number") return;
        // Half the round trip is the one-way estimate.
        skewRef.current = now + (Date.now() - sentAt) / 2 - Date.now();
      } catch {
        /* keep the local clock — drift is small and the game still works */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // First paint lands wherever the shared sequence actually is. Without this a
  // tab opened mid-flight would show a betting countdown running all the way to
  // the *next* round — up to ~28 s of dead screen — instead of the plane that is
  // in the air right now. Uses the local clock because the sync has not landed
  // yet; a second of drift only shifts where the plane is drawn.
  const joinedRef = useRef(false);
  useEffect(() => {
    if (joinedRef.current) return;
    joinedRef.current = true;
    const now = serverNow();
    const round = roundAt(now);
    if (phaseAt(now, round) !== "flight") return; // betting effect handles the rest
    sharedRoundRef.current = round;
    flightStartRef.current = round.flightAt;
    setRoundSeed(round.roundNumber);
    setLiveBets(randomBets(round.roundNumber));
    setCrashAt(round.crashAt);
    setMultiplier(1);
    setPhase("flight");
  }, [serverNow]);

  // Server-round tracking
  const skyRiseRoundIdRef = useRef<string | null>(null);
  const pendingFlightRef = useRef(false);
  // Bets lock in the final stretch of the countdown while the round request is
  // prefetched, so the flight can launch the instant the bar empties.
  const betsLockedRef = useRef(false);
  const prefetchedCrashRef = useRef<number | null>(null);
  const countdownOverRef = useRef(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 720, height: 420 });
  // const rocketStateRef = useRef<RocketState>({ x: 0, y: 0, angle: 0, active: false }); // Three.js rocket — re-enable when ready
  const [cashoutFlash, setCashoutFlash] = useState<{ id: number; amount: number } | null>(null);

  const triggerCashoutFlash = (amount: number) => {
    setCashoutFlash({ id: Date.now(), amount });
    window.setTimeout(() => setCashoutFlash(null), 1300);
  };

  // ── Sound refs ─────────────────────────────────────────────────────────────
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const betSfxRef = useRef<HTMLAudioElement | null>(null);
  const cashoutSfxRef = useRef<HTMLAudioElement | null>(null);
  const crashSfxRef = useRef<HTMLAudioElement | null>(null);
  const winSfxRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const sfx = getSoundSettings().sfx;
    betSfxRef.current = new Audio("/sounds/button-click.mp3");
    betSfxRef.current.volume = sfx * 0.6;
    cashoutSfxRef.current = new Audio("/sounds/win.mp3");
    cashoutSfxRef.current.volume = sfx;
    crashSfxRef.current = new Audio("/sounds/skyrise/skyrise-sprite.mp3");
    crashSfxRef.current.loop = false;
    crashSfxRef.current.volume = sfx * 0.7;
    winSfxRef.current = new Audio("/sounds/win.mp3");
    winSfxRef.current.volume = sfx;
    return () => {
      betSfxRef.current?.pause();
      cashoutSfxRef.current?.pause();
      crashSfxRef.current?.pause();
      winSfxRef.current?.pause();
    };
  }, []);

  // Skyrise-specific background music
  useEffect(() => {
    const bg = new Audio("/sounds/skyrise/bg-sound.mp3");
    bg.loop = true;
    bg.volume = getSoundSettings().bgMusic * 0.55;
    bg.play().catch(() => { });
    bgAudioRef.current = bg;
    return () => { bg.pause(); bg.src = ""; };
  }, []);

  // Resume bg music when the tab becomes visible again (mobile/OS may have
  // suspended it while backgrounded). We intentionally do NOT pause on hide —
  // it's a live game, so the audio carries on instead of cutting out on every
  // tab switch; the round itself also keeps running (see the rAF loops below).
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) bgAudioRef.current?.play().catch(() => { });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    return onSoundSettingsChange((s) => {
      if (bgAudioRef.current) bgAudioRef.current.volume = s.bgMusic * 0.55;
      if (betSfxRef.current) betSfxRef.current.volume = s.sfx * 0.6;
      if (cashoutSfxRef.current) cashoutSfxRef.current.volume = s.sfx;
      if (crashSfxRef.current) crashSfxRef.current.volume = s.sfx;
      if (winSfxRef.current) winSfxRef.current.volume = s.sfx;
    });
  }, []);

  // ── Stage resize ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      const width = box ? box.inlineSize : entry.contentRect.width;
      const height = box ? box.blockSize : entry.contentRect.height;
      if (width > 0 && height > 0) setStageSize({ width, height });
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Live bets: trickle in during the betting window ────────────────────────
  // Real crash games show bets arriving one by one while the countdown runs, not
  // the whole roster appearing at once. We build the full (seed-deterministic)
  // roster, seed the panel with the players who "joined early", then reveal the
  // rest spread across the betting window — so the PLAYING count visibly climbs.
  useEffect(() => {
    if (phase !== "betting") return;
    const roster = randomBets(roundSeed);
    const initial = Math.min(roster.length, Math.max(3, Math.round(roster.length * 0.3)));
    setLiveBets(roster.slice(0, initial));
    if (initial >= roster.length) return;

    const remaining = roster.length - initial;
    const windowMs = (ROUND_BETTING_SECONDS - 1) * 1000; // finish ~1s before flight
    const step = windowMs / remaining;
    const timers: number[] = [];
    for (let i = 0; i < remaining; i++) {
      // jitter each arrival so the reveal doesn't look metronomic
      const at = Math.min(windowMs, step * i + step * (0.2 + Math.random() * 0.6));
      timers.push(window.setTimeout(() => {
        setLiveBets((prev) => (prev.length < roster.length ? roster.slice(0, prev.length + 1) : prev));
      }, at));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [phase, roundSeed]);

  // ── Betting phase countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "betting") return;
    crashedRef.current = false; // reset for new round

    // A spectating tab runs to the shared launch instant so every idle device
    // leaves the gate together. A tab with a bet on the table keeps the fixed 5 s
    // cadence it has always had: its crash comes from the server, so its flight
    // is a different length anyway, and forcing it back onto the shared grid
    // would hand auto-betting players betting windows of up to ~28 s.
    const betting = betARef.current.status === "queued" || betBRef.current.status === "queued";
    let round = currentRound();
    let flightAt: number;

    if (betting) {
      flightAt = serverNow() + ROUND_BETTING_SECONDS * 1000;
    } else {
      if (round.flightAt - serverNow() < BETS_LOCK_SECONDS * 1000) {
        round = roundAfter(serverNow());
        sharedRoundRef.current = round;
        setRoundSeed(round.roundNumber);
      }
      flightAt = round.flightAt;
    }
    const windowSeconds = Math.max(0, (flightAt - serverNow()) / 1000);

    setCountdown(windowSeconds);
    let raf = 0;
    let lastDisplayed = -1; // force first update

    betsLockedRef.current = false;
    prefetchedCrashRef.current = null;
    countdownOverRef.current = false;
    // Set once the round request goes to the server: this round carries a real
    // bet, so its crash is the player's own rather than the shared sequence's.
    let personalRound = false;

    const doFlight = (serverCrashAt: number) => {
      pendingFlightRef.current = false;
      betsLockedRef.current = false;
      // A spectator round is anchored to the shared launch instant, so a tab that
      // reached it late catches up to where every other device's plane already is.
      // A round with a bet on it has no shared plane to catch up with, so it
      // launches from 1.00× whenever the server response lands. Anchoring it to
      // flightAt too made a slow response (common on mobile data) start the
      // flight 2–3 s in — the low multipliers were skipped, and a low crash
      // could end the round before the player ever saw the plane move.
      flightStartRef.current = personalRound ? Math.max(flightAt, serverNow()) : flightAt;
      setCrashAt(serverCrashAt);
      setMultiplier(1);
      setBetA((s) => (s.status === "queued" ? { ...s, status: "inflight" } : s));
      setBetB((s) => (s.status === "queued" ? { ...s, status: "inflight" } : s));
      setPhase("flight");
    };

    // Fire the round request while the countdown bar is still draining (bets
    // lock at the same moment, so what we send is exactly what plays). The
    // response is stashed until the bar empties, so the flight launches the
    // instant it hits zero instead of waiting a round-trip after it.
    const prefetchRound = () => {
      pendingFlightRef.current = true;
      betsLockedRef.current = true;

      const activeBets: Array<{ amount: number; autoCashoutAt: number | null }> = [];
      if (betARef.current.status === "queued") {
        activeBets.push({
          amount: betARef.current.amount,
          autoCashoutAt: betARef.current.autoCashout ? betARef.current.autoCashoutTarget : null,
        });
      }
      if (betBRef.current.status === "queued") {
        activeBets.push({
          amount: betBRef.current.amount,
          autoCashoutAt: betBRef.current.autoCashout ? betBRef.current.autoCashoutTarget : null,
        });
      }

      const arm = (crash: number) => {
        if (countdownOverRef.current) doFlight(crash);
        else prefetchedCrashRef.current = crash;
      };

      if (activeBets.length === 0) {
        // Spectator round — no money involved, so nothing to ask the server. The
        // crash comes off the shared sequence, which means every other spectating
        // device (and the round monitor) has the same number for this round.
        arm(round.crashAt);
        return;
      }

      personalRound = true;
      fetch("/api/games/skyrise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bets: activeBets }),
      })
        .then((r) => r.json())
        .then(({ roundId, crashAt: crashToken, newBalance }) => {
          skyRiseRoundIdRef.current = roundId ?? null;
          if (typeof newBalance === "number") setBalance(newBalance);
          const realCrash = decodeCrashAt(crashToken, roundId ?? "") ?? genCrashMultiplier();
          arm(realCrash);
        })
        .catch(() => arm(genCrashMultiplier()));
    };

    const tick = () => {
      // Real wall-clock time — NO hidden-tab compensation. If the player tabs
      // away, the betting window keeps elapsing and the round moves on, so they
      // rejoin the live game on return instead of resuming a frozen countdown.
      const left = Math.max(0, (flightAt - serverNow()) / 1000);
      // Throttle to ~10fps — countdown is a display-only value
      const tenths = Math.ceil(left * 10);
      if (tenths !== lastDisplayed) { lastDisplayed = tenths; setCountdown(left); }

      if (left <= BETS_LOCK_SECONDS && !pendingFlightRef.current) prefetchRound();

      if (left <= 0) {
        countdownOverRef.current = true;
        if (prefetchedCrashRef.current != null) {
          const crash = prefetchedCrashRef.current;
          prefetchedCrashRef.current = null;
          doFlight(crash);
        } else {
          // Server response still in flight — brief hold; arm() launches on arrival.
          setMultiplier(1);
          setPhase("loading");
        }
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, currentRound, serverNow]);

  // Stable refs so the flight tick can read latest values without re-subscribing
  const betARef = useRef(betA);
  const betBRef = useRef(betB);
  betARef.current = betA;
  betBRef.current = betB;
  const crashAtRef = useRef(crashAt);
  crashAtRef.current = crashAt;
  // Set true the instant crash is detected in rAF — prevents cashout clicks
  // that arrive before React finishes flushing the phase → "crash" state update.
  const crashedRef = useRef(false);
  // Always-current balance for resolveAutoBet (avoids stale closure in post effect)
  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  // ── Flight phase: multiplier, live-bets auto-cashout, player auto-cashout ──
  useEffect(() => {
    if (phase !== "flight") return;
    // Wall-clock anchored rather than "however long this effect has been
    // mounted", so joining a round already in progress renders the plane where
    // it actually is. That is what lets a tab drop into the shared sequence
    // mid-flight instead of idling until the next round.
    const startedAt = flightStartRef.current || serverNow();
    let raf = 0;
    const autoCashed = new Set<string>();

    const tick = () => {
      // Real wall-clock time — NO hidden-tab compensation. If the player tabs
      // away mid-flight, the rocket keeps flying; on return the first frame jumps
      // to true elapsed time, so the round has already crashed (and any auto-
      // cashout below the crash point still resolves first) — matching a live
      // shared round rather than freezing the multiplier where they left it.
      const elapsed = (Math.max(0, serverNow() - startedAt) / 1000) * ROUND_SPEED;
      const next = Math.exp(FLIGHT_GROWTH * elapsed);
      const localCrashAt = crashAtRef.current;

      // Avoid .map() allocation every frame — only build a new array when a bet
      // actually needs updating (prev reference stays identical otherwise).
      setLiveBets((prev) => {
        const toUpdate: number[] = [];
        for (let i = 0; i < prev.length; i++) {
          const bet = prev[i];
          if (bet.cashedAt == null && bet.cashedAtTarget != null &&
            next >= bet.cashedAtTarget && bet.cashedAtTarget < localCrashAt) {
            toUpdate.push(i);
          }
        }
        if (toUpdate.length === 0) return prev;
        const updated = [...prev];
        for (const i of toUpdate) updated[i] = { ...prev[i], cashedAt: prev[i].cashedAtTarget! };
        return updated;
      });

      // Player auto-cashout — guarded by Set so it fires at most once per round
      (["A", "B"] as const).forEach((key) => {
        if (autoCashed.has(key)) return;
        const stateRef = key === "A" ? betARef : betBRef;
        const setter = key === "A" ? setBetA : setBetB;
        const state = stateRef.current;
        if (state.status !== "inflight" || !state.autoCashout || next < state.autoCashoutTarget || state.autoCashoutTarget >= localCrashAt) return;
        autoCashed.add(key);
        const cashAt = state.autoCashoutTarget;
        const winAmount = state.amount * cashAt;
        setter((prev) => prev.status !== "inflight" ? prev : { ...prev, status: "cashed", cashedAt: cashAt, winStreak: prev.winStreak + 1, lossStreak: 0 });
        setBalance((prev) => prev + winAmount);
        if (winSfxRef.current) { winSfxRef.current.currentTime = 0; winSfxRef.current.play().catch(() => { }); }
        hapticCashout();
        fireCashoutConfetti();
        triggerCashoutFlash(winAmount);
      });

      if (next >= localCrashAt) {
        crashedRef.current = true; // synchronous guard — blocks cashout before next render
        setMultiplier(localCrashAt);
        if (crashSfxRef.current) { crashSfxRef.current.currentTime = 0; crashSfxRef.current.play().catch(() => { }); }
        setPhase("crash");
        return;
      }

      setMultiplier(Number(next.toFixed(2)));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, crashAt, serverNow]);

  // ── Crash phase ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "crash") return;
    if (betARef.current.status === "inflight" || betBRef.current.status === "inflight") hapticLoss();
    setBetA((s) => (s.status === "inflight" ? { ...s, status: "lost", lossStreak: s.lossStreak + 1, winStreak: 0 } : s));
    setBetB((s) => (s.status === "inflight" ? { ...s, status: "lost", lossStreak: s.lossStreak + 1, winStreak: 0 } : s));
    // Queued bets (placed via "Next Round" during flight) carry over — their local
    // balance deduction already happened in placeBet, and the server will deduct
    // again at the next round start and return the corrected newBalance.

    setHistory((prev) => [crashAt, ...prev].slice(0, 20));

    // Settle with server — fire-and-forget; sync balance on response
    const roundId = skyRiseRoundIdRef.current;
    if (roundId) {
      skyRiseRoundIdRef.current = null;
      const betOutcomes: Array<{ amount: number; cashedOutAt: number | null }> = [];
      for (const ref of [betARef, betBRef]) {
        const s = ref.current;
        if (s.status === "cashed" && s.cashedAt != null)
          betOutcomes.push({ amount: s.amount, cashedOutAt: s.cashedAt });
        else if (s.status === "inflight")
          betOutcomes.push({ amount: s.amount, cashedOutAt: null });
      }
      if (betOutcomes.length > 0) {
        fetch("/api/games/skyrise/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roundId, betOutcomes }),
        })
          .then((r) => r.json())
          .then(({ newBalance }) => { if (typeof newBalance === "number") setBalance(newBalance); })
          .catch(() => { });
      }
    }

    const t = window.setTimeout(() => setPhase("post"), 1400);
    return () => window.clearTimeout(t);
  }, [phase, crashAt]);

  // ── Post phase → new round ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "post") return;
    const t = window.setTimeout(() => {
      const bal = balanceRef.current;
      const nextA = resolveAutoBet(betARef.current, bal);
      const nextB = resolveAutoBet(betBRef.current, bal);
      setBetA(nextA);
      setBetB(nextB);

      // Re-join the shared clock. A round that carried a real bet ran on the
      // server's crash point, so it finished early or late and this tab is now
      // somewhere in the middle of the sequence — pick up wherever it actually is.
      const now = serverNow();
      let round = roundAt(now);
      const livePhase = phaseAt(now, round);
      const wantsToBet = nextA.status === "queued" || nextB.status === "queued";

      // A queued bet goes straight into its own free-running 5 s window (the
      // betting effect handles that) — only the round number is taken from the
      // clock, so the badge still matches everyone else's.
      if (wantsToBet) {
        sharedRoundRef.current = round;
        setRoundSeed(round.roundNumber);
        setPhase("betting");
        return;
      }

      if (livePhase !== "flight") {
        if (round.flightAt - now < BETS_LOCK_SECONDS * 1000) round = roundAfter(now);
        sharedRoundRef.current = round;
        setRoundSeed(round.roundNumber);
        setPhase("betting");
        return;
      }

      // Pure spectator and a shared round is already in the air — drop straight
      // into it rather than sitting out the rest of it on a blank screen.
      sharedRoundRef.current = round;
      crashedRef.current = false;
      betsLockedRef.current = false;
      flightStartRef.current = round.flightAt;
      setRoundSeed(round.roundNumber);
      setLiveBets(randomBets(round.roundNumber));
      setCrashAt(round.crashAt);
      setMultiplier(1);
      setPhase("flight");
    }, POST_MS);
    return () => window.clearTimeout(t);
  }, [phase, serverNow]);

  const totalBet = useMemo(() => liveBets.reduce((sum, b) => sum + b.amount, 0), [liveBets]);
  const totalPlayers = liveBets.length;

  const cashoutTargets = useMemo<CashoutTarget[]>(() => {
    const result: CashoutTarget[] = [];
    if (betA.autoCashout && (betA.status === "inflight" || betA.status === "queued"))
      result.push({ id: "A", multiplier: betA.autoCashoutTarget });
    if (betB.autoCashout && (betB.status === "inflight" || betB.status === "queued"))
      result.push({ id: "B", multiplier: betB.autoCashoutTarget });
    return result;
  }, [betA.autoCashout, betA.autoCashoutTarget, betA.status, betB.autoCashout, betB.autoCashoutTarget, betB.status]);

  const flightTime = useMemo(
    () => (Math.log(Math.max(1.0001, multiplier)) / FLIGHT_GROWTH).toFixed(1),
    [multiplier],
  );

  // ── Logged-in player's live bets for the side panel ────────────────────────
  const playerBets = useMemo<PlayerBet[]>(() => {
    const active = (
      [{ id: "A" as BetId, s: betA }, { id: "B" as BetId, s: betB }]
    ).filter(({ s }) => s.status !== "idle" && s.status !== "lost");
    const hasBoth = active.length === 2;
    const label = (id: BetId) =>
      hasBoth ? `${userName ?? "You"} · ${id}` : (userName ?? "You");
    return active.map(({ id, s }) => ({
      id,
      name: label(id),
      amount: s.amount,
      status: s.status,
      cashedAt: s.cashedAt,
    }));
  }, [betA, betB, userName]);

  // ── Refresh balance from API (used by GamesWrapper deposit flow) ────────────
  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/summary", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
      }
    } catch { /* silent */ }
  }, []);

  const userHasActiveBet = betA.status === "queued" || betA.status === "inflight" || betB.status === "queued" || betB.status === "inflight";
  const hasAutoBet = (betA.autoBet && betA.status !== "idle") || (betB.autoBet && betB.status !== "idle");

  // Turn off auto-bet so the wrapper's offline guard can actually halt autoplay.
  // Without this the "autoplay stopped" toast would lie and rounds would keep
  // firing on client-side RNG with no server settlement while offline.
  const stopAutoPlay = useCallback(() => {
    setBetA((s) => (s.autoBet ? { ...s, autoBet: false } : s));
    setBetB((s) => (s.autoBet ? { ...s, autoBet: false } : s));
  }, []);

  const placeBet = (which: BetId, amount: number) => {
    // Bets are closed once the round request has been sent (final ~0.6s).
    if (betsLockedRef.current) return;
    if (amount > balance) { setDepositOpen(true); return; }
    setBalance((prev) => prev - amount);
    const setter = which === "A" ? setBetA : setBetB;
    setter((s) => ({ ...s, amount, status: "queued", cashedAt: null }));
    if (betSfxRef.current) { betSfxRef.current.currentTime = 0; betSfxRef.current.play().catch(() => { }); }
    hapticTap();
  };

  const cancelBet = (which: BetId) => {
    // The queued bet was already sent with the round request — too late to pull.
    if (betsLockedRef.current) return;
    const state = which === "A" ? betA : betB;
    if (state.status !== "queued") return;
    setBalance((prev) => prev + state.amount);
    const setter = which === "A" ? setBetA : setBetB;
    setter((prev) => ({ ...prev, status: "idle" }));
  };

  const cashout = (which: BetId, currentMultiplier: number) => {
    const state = which === "A" ? betA : betB;
    if (state.status !== "inflight") return;
    // Reject if crash was already detected — covers the render gap between the rAF
    // setting crashedRef and React applying phase → "crash" / status → "lost".
    if (crashedRef.current) return;
    const winAmount = state.amount * currentMultiplier;
    setBalance((prev) => prev + winAmount);
    const setter = which === "A" ? setBetA : setBetB;
    setter((prev) => ({ ...prev, status: "cashed", cashedAt: currentMultiplier, winStreak: prev.winStreak + 1, lossStreak: 0 }));
    if (cashoutSfxRef.current) { cashoutSfxRef.current.currentTime = 0; cashoutSfxRef.current.play().catch(() => { }); }
    hapticCashout();
    fireCashoutConfetti();
    triggerCashoutFlash(winAmount);
  };

  return (
    <>
      <GamesNativeWrapper
        balance={balance}
        name="Aviator"
        subtitle="Crash · Plane"
        gameType="skyrise"
        isPlaying={userHasActiveBet}
        autoPlay={hasAutoBet}
        stopAutoPlay={stopAutoPlay}
        onDepositClose={refreshBalance}
      >
        {/* ── Live Bets sidebar — desktop only (mobile uses drawer) ── */}
        {liveBetsVisible ? (
          <div
            className={`hidden lg:flex min-h-0 shrink-0 flex-col ${liveBetsCollapsed ? "lg:w-14" : "lg:w-[280px]"} lg:order-1 lg:border-r border-white/[0.06]`}
          >
            <LiveBetsPanel
              bets={liveBets}
              playerBets={playerBets}
              totalBet={totalBet + playerBets.reduce((s, b) => s + b.amount, 0)}
              totalPlayers={totalPlayers + Math.min(playerBets.length, 1)}
              collapsed={liveBetsCollapsed}
              onToggleCollapse={() => setLiveBetsCollapsed((prev) => !prev)}
              onClose={() => setLiveBetsVisible(false)}
            />
          </div>
        ) : null}

        {/* ── Main: stage + bet cards ── */}
        <section className="relative order-1 flex min-h-0 flex-1 flex-col overflow-hidden lg:order-2">

          {/* ── Mobile live bets drawer ── */}
          {mobileBetsOpen && (
            <>
              <div
                className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm lg:hidden"
                onClick={() => setMobileBetsOpen(false)}
              />
              <div className="absolute inset-y-0 left-0 z-[55] flex w-[280px] flex-col overflow-hidden border-r border-white/[0.07] bg-[#0e0c1f]/96 backdrop-blur-md lg:hidden">
                <LiveBetsPanel
                  bets={liveBets}
                  playerBets={playerBets}
                  totalBet={totalBet + playerBets.reduce((s, b) => s + b.amount, 0)}
                  totalPlayers={totalPlayers + Math.min(playerBets.length, 1)}
                  collapsed={false}
                  onToggleCollapse={() => { }}
                  onClose={() => setMobileBetsOpen(false)}
                />
              </div>
            </>
          )}

          {/* Stage */}
          <div ref={stageRef} className="relative min-h-[350px] shrink-0 overflow-hidden flex-1 lg:shrink">
            <StarGridScene phase={phase} multiplier={multiplier} />
            <div className="absolute inset-0">
              <FlightCurve
                phase={phase}
                multiplier={multiplier}
                crashAt={crashAt}
                width={stageSize.width}
                height={stageSize.height}
                cashoutTargets={cashoutTargets}
              // rocketStateRef={rocketStateRef} // Three.js rocket — re-enable when ready
              />
              <MultiplierReadout phase={phase} multiplier={multiplier} crashAt={crashAt} countdown={countdown} />

              {/* Round badge */}
              <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/45 backdrop-blur-xl">
                <BoltIcon size={10} /> ROUND #{roundSeed}
              </div>

              {/* Players badge — desktop only. On mobile the bottom-left button
                  already shows the same count (and opens the bets drawer), so
                  this badge was a second, non-interactive copy of it. */}
              <div className="absolute right-3 top-3 hidden lg:flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/45 backdrop-blur-xl">
                <UsersIcon size={10} /> {totalPlayers} PLAYING
              </div>

              {/* Round history chips — newest left, fades to right */}
              <RoundHistoryBar history={history} />

              {/* Desktop: show live bets button (only when hidden) */}
              {!liveBetsVisible ? (
                <button
                  type="button"
                  onClick={() => setLiveBetsVisible(true)}
                  className="absolute bottom-3 left-3 hidden lg:flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/55 px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/65 backdrop-blur-xl hover:bg-white/10"
                >
                  <UsersIcon size={12} /> Show Live Bets
                </button>
              ) : null}

              {/* Mobile: all bets button — always visible, opens drawer */}
              <button
                type="button"
                onClick={() => setMobileBetsOpen(true)}
                className="absolute bottom-3 left-3 flex lg:hidden items-center gap-2 rounded-full border border-white/[0.08] bg-black/55 px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/65 backdrop-blur-xl active:scale-95"
              >
                <UsersIcon size={12} /> {totalPlayers} Playing
              </button>

              {/* In-flight timer */}
              {phase === "flight" && (
                <div className="absolute bottom-3 right-3 rounded-full border border-white/[0.08] bg-black/50 px-3 py-1 font-mono text-[11px] font-bold text-white/55 backdrop-blur-xl tabular-nums">
                  {flightTime}s
                </div>
              )}

              {/* Cashout flash overlay */}
              {cashoutFlash && <CashoutFlash key={cashoutFlash.id} amount={cashoutFlash.amount} />}
            </div>
          </div>

          {/* Bet cards */}
          <div className={`grid min-h-0 overflow-y-auto border-t border-white/[0.06] bg-[#100d20] p-2.5 lg:shrink-0 lg:overflow-visible gap-2 ${showBetB ? "md:grid-cols-2" : "grid-cols-1"}`}>
            <BetCard
              id="A"
              state={betA}
              setState={setBetA}
              phase={phase}
              multiplier={multiplier}
              disabled={false}
              onPlace={(amount) => placeBet("A", amount)}
              onCancel={() => cancelBet("A")}
              onCashout={(value) => cashout("A", value)}
              onCollapse={showBetB ? () => setShowBetB(false) : undefined}
              collapseButtonClass="md:hidden"
              onExpand={!showBetB ? () => setShowBetB(true) : undefined}
            />
            {showBetB && (
              <BetCard
                id="B"
                state={betB}
                setState={setBetB}
                phase={phase}
                multiplier={multiplier}
                disabled={false}
                onPlace={(amount) => placeBet("B", amount)}
                onCancel={() => cancelBet("B")}
                onCashout={(value) => cashout("B", value)}
                onCollapse={() => setShowBetB(false)}
                collapseButtonClass="hidden md:flex"
              />
            )}
          </div>
        </section>
      </GamesNativeWrapper>
      <DepositSheet includePaddingBottom={false} open={depositOpen} onClose={async () => { setDepositOpen(false); await refreshBalance(); }} />
    </>
  );
}
