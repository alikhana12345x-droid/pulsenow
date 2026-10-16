"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { TrackBar } from "./track-bar";
import GamesWrapper from "../games-wrapper";
import { DepositSheet } from "@/components/deposit-sheet";
import { playClick } from "@/lib/sound";
import { getSoundSettings, onSoundSettingsChange } from "@/lib/sound-settings";
import { hapticTap, hapticWin, hapticLoss } from "@/lib/haptics";
import { fireWinConfetti } from "@/lib/confetti";

const ThreeCanvas = dynamic(
  () => import("./three-canvas").then((m) => m.ThreeCanvas),
  { ssr: false }
);

const PRESETS = [100, 500, 1000, 5000] as const;
const HOUSE_EDGE = 0.01;
const MIN_TARGET = 2;
const MAX_TARGET = 97;
const MAX_WIN_CHANCE = 95;
const ACCENT = "#f29a0b";

type Side = "over" | "under";

interface BetResponse {
  outcome: { roll: number };
  won: boolean;
  newBalance: number;
  error?: string;
}

function fmtPKR(n: number) {
  return n.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function rawWinChance(target: number, side: Side) {
  return side === "over" ? 99 - target : target;
}

function calcWinChance(target: number, side: Side) {
  return Math.min(rawWinChance(target, side), MAX_WIN_CHANCE);
}

function calcMultiplier(target: number, side: Side) {
  const wc = calcWinChance(target, side) / 100;
  if (wc <= 0) return 0;
  return parseFloat(((1 - HOUSE_EDGE) / wc).toFixed(2));
}

function GlassPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex-shrink-0 rounded-3xl border border-white/[0.06] bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Dice3DGame({ initialBalance }: { initialBalance: number }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [side, setSide] = useState<Side>("over");
  const [target, setTarget] = useState(50);
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState("100");
  const [rolling, setRolling] = useState(false);
  const [displayRoll, setDisplayRoll] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<{ roll: number; won: boolean } | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [error, setError] = useState<string | null>(null);
  const [diceFace, setDiceFace] = useState(1);
  const [diceRolling, setDiceRolling] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const autoPlayRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollRef = useRef<() => void>(() => { });

  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const loseAudioRef = useRef<HTMLAudioElement | null>(null);

  const multiplier = calcMultiplier(target, side);
  const winChance = calcWinChance(target, side);
  const profitOnWin = parseFloat((amount * multiplier - amount).toFixed(2));
  const isOverCap = rawWinChance(target, side) > MAX_WIN_CHANCE;
  const rollPercent = displayRoll !== null ? Math.min(displayRoll, 99.99) : null;

  const resultColor =
    lastResult == null ? "text-bp-text" : lastResult.won ? "text-bp-win" : "text-bp-lose";

  useEffect(() => {
    const sfxVol = getSoundSettings().sfx;
    audioRef.current = new Audio("/sounds/dice-roll/dice-roll.mp3");
    audioRef.current.volume = sfxVol;
    winAudioRef.current = new Audio("/sounds/win.mp3");
    winAudioRef.current.volume = sfxVol;
    loseAudioRef.current = new Audio("/sounds/loss.mp3");
    loseAudioRef.current.volume = sfxVol;
    return () => {
      audioRef.current?.pause();
      winAudioRef.current?.pause();
      loseAudioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const bg = new Audio("/sounds/dice-roll/bg-sound.mp3");
    bg.loop = true;
    bg.volume = getSoundSettings().bgMusic;
    bg.play().catch(() => { });
    bgAudioRef.current = bg;
    return () => { bg.pause(); bg.src = ""; };
  }, []);

  // Pause bg music when tab is hidden, resume when visible
  useEffect(() => {
    const handleVisibility = () => {
      if (!bgAudioRef.current) return;
      if (document.hidden) {
        bgAudioRef.current.pause();
      } else {
        bgAudioRef.current.play().catch(() => { });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Sync audio volumes when sound settings change
  useEffect(() => {
    return onSoundSettingsChange((s) => {
      if (audioRef.current) audioRef.current.volume = s.sfx;
      if (bgAudioRef.current) bgAudioRef.current.volume = s.bgMusic;
      if (winAudioRef.current) winAudioRef.current.volume = s.sfx;
      if (loseAudioRef.current) loseAudioRef.current.volume = s.sfx;
    });
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/summary", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
      }
    } catch { /* silent — stale balance is better than a crash */ }
  }, []);

  const stopAnim = () => {
    if (animRef.current) {
      clearInterval(animRef.current);
      animRef.current = null;
    }
  };

  const roll = useCallback(async () => {
    if (rolling) return;
    if (amount < 10 || amount > balance) { setDepositOpen(true); return; }
    // Clear any pending auto timer (handles both manual clicks during gap and auto-fired rounds)
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
    setAutoRunning(false);
    playClick();
    hapticTap();

    if (isOverCap) {
      setError(`Win chance capped at ${MAX_WIN_CHANCE}%. Adjust target or side.`);
      return;
    }

    setRolling(true);
    setDiceRolling(true);
    setError(null);
    setLastResult(null);

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.loop = true;
      audioRef.current.play().catch(() => { });
    }

    animRef.current = setInterval(() => {
      setDisplayRoll(parseFloat((Math.random() * 99.99).toFixed(2)));
    }, 35);

    try {
      const res = await fetch("/api/games/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType: "dice", amount, choice: { target, side } }),
      });

      const data: BetResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bet failed");

      setTimeout(() => {
        stopAnim();
        if (audioRef.current) {
          audioRef.current.loop = false;
          audioRef.current.pause();
        }
        const outcomeAudio = data.won ? winAudioRef.current : loseAudioRef.current;
        if (outcomeAudio) { outcomeAudio.currentTime = 0; outcomeAudio.play().catch(() => { }); }
        data.won ? hapticWin() : hapticLoss();
        if (data.won) fireWinConfetti();
        const finalRoll = data.outcome.roll;
        setDisplayRoll(finalRoll);
        // Won → face 4-6 (high), lost → face 1-3 (low), proportional within each zone
        {
          const wZone = side === "over" ? 99.99 - target : target;
          const lZone = side === "over" ? target : 99.99 - target;
          if (data.won) {
            const dist = side === "over" ? finalRoll - target : target - finalRoll;
            const s = wZone > 0 ? Math.min(1, dist / wZone) : 0.5;
            setDiceFace(4 + Math.min(2, Math.floor(s * 3)));
          } else {
            const dist = side === "over" ? target - finalRoll : finalRoll - target;
            const s = lZone > 0 ? Math.min(1, dist / lZone) : 0.5;
            setDiceFace(3 - Math.min(2, Math.floor(s * 3)));
          }
        }
        setLastResult({ roll: finalRoll, won: data.won });
        setBalance(data.newBalance);
        setDiceRolling(false);
        setRolling(false);
        if (autoPlayRef.current) {
          if (data.newBalance >= amount) {
            setAutoRunning(true);
            autoTimerRef.current = setTimeout(() => {
              autoTimerRef.current = null;
              if (autoPlayRef.current) rollRef.current();
            }, 1500);
          } else {
            autoPlayRef.current = false;
            setAutoPlay(false);
            setAutoRunning(false);
          }
        }
      }, 1500);
    } catch (e: unknown) {
      stopAnim();
      if (audioRef.current) {
        audioRef.current.loop = false;
        audioRef.current.pause();
      }
      autoPlayRef.current = false;
      setAutoPlay(false);
      setAutoRunning(false);
      setDiceRolling(false);
      setDisplayRoll(null);
      setError(e instanceof Error ? e.message : "Error placing bet");
      setRolling(false);
    }
  }, [amount, balance, isOverCap, rolling, side, target]);

  // Keep rollRef pointing at the latest roll (avoids stale closure in auto timer)
  useEffect(() => { rollRef.current = roll; }, [roll]);

  // Clean up the display-roll animation interval on unmount
  useEffect(() => () => { if (animRef.current) clearInterval(animRef.current); }, []);



  const stopAutoPlayFn = useCallback(() => {
    autoPlayRef.current = false;
    setAutoPlay(false);
    setAutoRunning(false);
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
  }, []);

  // Cleanup auto-play on unmount
  useEffect(() => () => { stopAutoPlayFn(); }, [stopAutoPlayFn]);

  const toggleAutoPlay = useCallback(() => {
    playClick();
    if (autoPlayRef.current) {
      stopAutoPlayFn();
    } else {
      if (rolling || isOverCap) return;
      autoPlayRef.current = true;
      setAutoPlay(true);
      // No immediate roll — user must press Roll Dice to start the first round
    }
  }, [rolling, isOverCap, stopAutoPlayFn]);

  const setPreset = (v: number) => { playClick(); setAmount(v); setCustomAmount(String(v)); };
  const handleCustom = (v: string) => {
    setCustomAmount(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > 0) setAmount(n);
  };
  const half = () => {
    playClick();
    const n = Math.max(10, parseFloat((amount / 2).toFixed(2)));
    setAmount(n); setCustomAmount(String(n));
  };
  const double = () => {
    playClick();
    const n = Math.min(20000, parseFloat((amount * 2).toFixed(2)));
    setAmount(n); setCustomAmount(String(n));
  };

  return (
    <>
    <GamesWrapper balance={balance} name="Dice 3D" gameType="dice" isPlaying={rolling} stopAutoPlay={stopAutoPlayFn} onDepositClose={refreshBalance} autoPlay={autoPlay}>

      {/* ── Stage ── expands to fill all space above controls ── */}
      <div className="relative min-h-[220px] flex-1 overflow-hidden bg-[radial-gradient(ellipse_80%_70%_at_50%_60%,rgba(242,154,11,0.14)_0%,transparent_70%),radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(100,80,200,0.12)_0%,transparent_60%),linear-gradient(180deg,#0a0812_0%,#0c0918_100%)]">
        <div className="absolute inset-0">
          <ThreeCanvas face={diceFace} rolling={diceRolling} accent={ACCENT} />
        </div>

        <div className="pointer-events-none absolute bottom-5 left-0 right-0 z-[3] flex flex-col items-center gap-1.5">
          <div className={`font-bp-mono text-[52px] font-bold uppercase leading-none tracking-[-2px] ${resultColor}`}>
            {displayRoll !== null ? displayRoll.toFixed(2) : "——.——"}
          </div>
          {lastResult ? (
            <div className={`rounded-full border px-5 py-2 font-bp-mono text-[15px] font-bold ${lastResult.won ? "border-bp-win/40 bg-bp-win/15 text-bp-win" : "border-bp-lose/40 bg-bp-lose/15 text-bp-lose"}`}>
              {lastResult.won ? `+PKR ${fmtPKR(profitOnWin)}` : `-PKR ${fmtPKR(amount)}`}
            </div>
          ) : (
            <div className="text-[14px] uppercase tracking-[3px] text-white/30">
              {rolling ? "Rolling…" : `Roll ${side} ${target}`}
            </div>
          )}
        </div>
      </div>

      {/* ── Controls ── wraps content height on mobile, fixed width on desktop ── */}
      <div
        className="flex flex-shrink-0 w-full flex-col gap-3 overflow-y-auto bg-gradient-to-b from-[rgba(8,10,20,0.82)] to-[rgba(10,8,18,1)] px-4 py-4 sm:px-6 lg:w-[420px] lg:flex-1 lg:overflow-y-auto"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >

        {/* Panel 1: Track + Side + Target — all in one panel */}
        <GlassPanel>
          <TrackBar
            side={side}
            target={target}
            rollPercent={rollPercent}
            lastResult={lastResult}
            accent={ACCENT}
          />

          <div className="mt-4">
            {/* Over / Under toggle */}
            <div className="relative grid grid-cols-2 rounded-3xl border border-white/[0.04] bg-black/35 p-1.5">
              <div
                className={`absolute bottom-1.5 top-1.5 rounded-2xl bg-gradient-to-b from-bp-accent to-[#c97e08] shadow-[0_2px_16px_rgba(242,154,11,0.4)] transition-all duration-300 ${side === "over" ? "left-1.5 right-[50%]" : "left-[50%] right-1.5"}`}
              />
              {(["over", "under"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => { playClick(); setSide(s); }}
                  disabled={rolling || autoPlay}
                  className={`relative z-[1] min-h-[44px] rounded-2xl py-2.5 text-[17px] font-extrabold uppercase tracking-wider transition-colors disabled:cursor-not-allowed ${side === s ? "text-[#1b1305]" : "text-white/55"}`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Target slider */}
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[12px] uppercase tracking-[2px] text-white/45">Target</span>
                <span className={`font-bp-mono text-2xl font-bold ${isOverCap ? "text-bp-lose" : "text-bp-accent"}`}>
                  {side === "over" ? ">" : "<"} {target}
                </span>
              </div>

              <div className="relative py-2.5">
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-gradient-to-r from-bp-accent/50 to-bp-accent" style={{ width: `${target}%` }} />
                </div>
                <input
                  type="range"
                  min={MIN_TARGET}
                  max={MAX_TARGET}
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  disabled={rolling || autoPlay}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
                <div
                  className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 bg-[radial-gradient(circle_at_35%_30%,#fff_0%,#f29a0b_80%)] shadow-[0_2px_10px_rgba(242,154,11,0.6)]"
                  style={{ left: `${((target - MIN_TARGET) / (MAX_TARGET - MIN_TARGET)) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {isOverCap && (
            <div className="mt-2 rounded-2xl border border-bp-lose/30 bg-bp-lose/10 px-3 py-2 text-sm font-semibold text-bp-lose">
              Win chance exceeds {MAX_WIN_CHANCE}% — adjust target or side.
            </div>
          )}
        </GlassPanel>

        {/* Panel 2: Bet Amount + Stats — merged to save vertical space */}
        <GlassPanel>
          <div className="mb-2 text-[12px] uppercase tracking-[2px] text-white/45">Bet Amount</div>

          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                disabled={rolling || autoPlay}
                className={`min-h-[44px] rounded-2xl border py-2 font-bp-mono text-[17px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${amount === p ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent" : "border-white/[0.06] bg-black/25 text-white/75 hover:bg-black/40"}`}
              >
                {p >= 1000 ? `${p / 1000}k` : p}
              </button>
            ))}
          </div>

          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-white/40">PKR</span>
              <input
                type="number"
                value={customAmount}
                onChange={(e) => handleCustom(e.target.value)}
                disabled={rolling || autoPlay}
                min={10}
                max={20000}
                className="w-full rounded-2xl border border-white/[0.06] bg-black/30 py-3 pl-14 pr-3 font-bp-mono text-[17px] font-bold text-white outline-none focus:border-bp-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <button
              onClick={half}
              disabled={rolling || autoPlay}
              className="min-h-[44px] min-w-[60px] rounded-2xl border border-white/[0.06] bg-black/30 px-3 font-bp-mono text-[18px] font-bold text-white/85 hover:bg-black/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ½
            </button>
            <button
              onClick={double}
              disabled={rolling || autoPlay}
              className="min-h-[44px] min-w-[60px] rounded-2xl border border-white/[0.06] bg-black/30 px-3 font-bp-mono text-[18px] font-bold text-white/85 hover:bg-black/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              2×
            </button>
          </div>

          {/* Stats row — lives inside the bet panel, no extra panel overhead */}
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3">
            {[
              { label: "Win chance", value: `${winChance}%` },
              { label: "Multiplier", value: `${multiplier.toFixed(2)}×`, accent: true },
              { label: "Profit", value: `+${profitOnWin >= 1000 ? `${(profitOnWin / 1000).toFixed(1)}k` : profitOnWin.toFixed(0)}` },
            ].map(({ label, value, accent }) => (
              <div key={label} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-2 py-2.5 text-center">
                <div className="text-[11px] uppercase tracking-wider text-white/40">{label}</div>
                <div className={`mt-0.5 font-bp-mono text-[17px] font-bold ${accent ? "text-bp-accent" : "text-white"}`}>{value}</div>
              </div>
            ))}
          </div>
        </GlassPanel>

        {error && (
          <div className="rounded-2xl border border-bp-lose/30 bg-bp-lose/10 px-4 py-2.5 text-center text-sm text-bp-lose">
            {error}
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={roll}
            disabled={rolling || autoRunning || isOverCap}
            className="flex-1 rounded-3xl border-0 bg-gradient-to-b from-bp-accent to-[#c97e08] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-[#1b1305] shadow-[0_4px_18px_rgba(242,154,11,0.45)] transition-all hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:text-[17px]"
          >
            {rolling ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1b1305]/30 border-t-[#1b1305]" />
                {autoPlay ? "Auto…" : "Rolling…"}
              </span>
            ) : autoRunning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#1b1305]/70" />
                Next Round…
              </span>
            ) : (
              "Roll Dice"
            )}
          </button>
          <button
            onClick={toggleAutoPlay}
            disabled={!autoPlay && (rolling || amount < 10 || amount > 20000 || amount > balance || isOverCap)}
            className={`min-w-[72px] rounded-3xl border py-4 font-bp-ui text-[14px] font-black uppercase tracking-[1.5px] transition-all sm:text-[15px] ${autoPlay
              ? "border-bp-accent/60 bg-bp-accent/20 text-bp-accent shadow-[0_2px_16px_rgba(242,154,11,0.2)]"
              : "border-white/[0.08] bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              }`}
          >
            {autoPlay ? "Stop" : "Auto"}
          </button>
        </div>
      </div>
    </GamesWrapper>
    <DepositSheet includePaddingBottom={false} open={depositOpen} onClose={async () => { setDepositOpen(false); await refreshBalance(); }} />
    </>
  );
}
