"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GamesWrapper from "../games-wrapper";
import { LimboWarp, type WarpPhase } from "./limbo-warp";
import { DepositSheet } from "@/components/deposit-sheet";
import { playClick } from "@/lib/sound";
import { getSoundSettings, onSoundSettingsChange } from "@/lib/sound-settings";
import { hapticTap, hapticWin, hapticLoss } from "@/lib/haptics";
import { fireWinConfetti } from "@/lib/confetti";

const PRESETS = [100, 500, 1000, 5000] as const;
const TARGET_PRESETS = [2, 5, 10, 50] as const;
const HOUSE_EDGE = 0.01;
const MIN_TARGET = 1.05;
const MAX_TARGET = 1000;

// Log-scaled slider: a linear 1.05→1000 slider would bunch everything above 100×.
const LOG_MIN = Math.log(MIN_TARGET);
const LOG_RANGE = Math.log(MAX_TARGET) - LOG_MIN;
const SLIDER_STEPS = 1000;

type LimboResult = { result: number; won: boolean };

interface BetResponse {
  outcome: { result: number; target: number };
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

function clampTarget(t: number) {
  if (!Number.isFinite(t)) return MIN_TARGET;
  return Math.min(MAX_TARGET, Math.max(MIN_TARGET, t));
}

function winChanceFor(target: number) {
  return (1 - HOUSE_EDGE) / target * 100; // fair odds, 1% edge baked in
}

function sliderFromTarget(t: number) {
  return Math.round(((Math.log(t) - LOG_MIN) / LOG_RANGE) * SLIDER_STEPS);
}

function targetFromSlider(s: number) {
  const t = Math.exp(LOG_MIN + (s / SLIDER_STEPS) * LOG_RANGE);
  // Cleaner step values as the multiplier climbs.
  if (t < 10) return parseFloat(t.toFixed(2));
  if (t < 100) return parseFloat(t.toFixed(1));
  return Math.round(t);
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

export function LimboGame({ initialBalance }: { initialBalance: number }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [target, setTarget] = useState(2);
  const [customTarget, setCustomTarget] = useState("2.00");
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState("100");
  const [rolling, setRolling] = useState(false);
  const [displayResult, setDisplayResult] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<LimboResult | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const autoPlayRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollRef = useRef<() => void>(() => { });

  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const loseAudioRef = useRef<HTMLAudioElement | null>(null);

  const winChance = winChanceFor(target);
  const profitOnWin = parseFloat((amount * target - amount).toFixed(2));
  const sliderVal = sliderFromTarget(target);
  const sliderPct = (sliderVal / SLIDER_STEPS) * 100;

  const resultColor =
    lastResult == null ? "text-bp-text" : lastResult.won ? "text-bp-win" : "text-bp-lose";

  // Drive the 3D warp field behind the readout.
  const warpPhase: WarpPhase = rolling
    ? "rolling"
    : lastResult
      ? (lastResult.won ? "won" : "lost")
      : "idle";
  const warpMultiplier = displayResult ?? 1;

  // Glow the multiplier to match its state (gold idle → teal win → red loss).
  const glowRGBA =
    lastResult == null ? "242,154,11" : lastResult.won ? "94,234,212" : "255,93,115";
  const numberGlow = `0 0 24px rgba(${glowRGBA},0.55), 0 0 60px rgba(${glowRGBA},0.35)`;

  useEffect(() => {
    const sfxVol = getSoundSettings().sfx;
    winAudioRef.current = new Audio("/sounds/win.mp3");
    winAudioRef.current.volume = sfxVol;
    loseAudioRef.current = new Audio("/sounds/loss.mp3");
    loseAudioRef.current.volume = sfxVol;
    return () => {
      winAudioRef.current?.pause();
      loseAudioRef.current?.pause();
    };
  }, []);

  // Limbo-specific background music
  useEffect(() => {
    const bg = new Audio("/sounds/limbo/bg-sound.mp3");
    bg.loop = true;
    bg.volume = getSoundSettings().bgMusic * 0.55;
    bg.play().catch(() => { });
    bgAudioRef.current = bg;
    return () => { bg.pause(); bg.src = ""; };
  }, []);

  // Resume bg music when the tab becomes visible again (mobile/OS may have
  // suspended it while backgrounded).
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) bgAudioRef.current?.play().catch(() => { });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Sync audio volumes when sound settings change
  useEffect(() => {
    return onSoundSettingsChange((s) => {
      if (bgAudioRef.current) bgAudioRef.current.volume = s.bgMusic * 0.55;
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
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
    setAutoRunning(false);
    playClick();

    if (amount > 20000) {
      setError("Max bet is PKR 20,000.");
      return;
    }
    if (amount < 10 || amount > balance) {
      setDepositOpen(true);
      return;
    }

    hapticTap();
    setRolling(true);
    setError(null);
    setLastResult(null);

    // Spin the readout with plausible multipliers until the server result lands.
    animRef.current = setInterval(() => {
      setDisplayResult(parseFloat((1 + Math.random() * Math.max(8, target)).toFixed(2)));
    }, 45);

    try {
      const res = await fetch("/api/games/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType: "limbo", amount, choice: { target } }),
      });

      const data: BetResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bet failed");

      setTimeout(() => {
        stopAnim();
        const finalResult = data.outcome.result;
        const outcomeAudio = data.won ? winAudioRef.current : loseAudioRef.current;
        if (outcomeAudio) { outcomeAudio.currentTime = 0; outcomeAudio.play().catch(() => { }); }
        if (data.won) hapticWin(); else hapticLoss();
        if (data.won) fireWinConfetti();
        setDisplayResult(finalResult);
        setLastResult({ result: finalResult, won: data.won });
        setBalance(data.newBalance);
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
      autoPlayRef.current = false;
      setAutoPlay(false);
      setAutoRunning(false);
      setError(e instanceof Error ? e.message : "Error placing bet");
      setRolling(false);
    }
  }, [amount, balance, rolling, target]);

  // Keep rollRef pointing at the latest roll (avoids stale closure in auto timer)
  useEffect(() => { rollRef.current = roll; }, [roll]);

  // Clean up the display animation interval on unmount
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
      if (rolling) return;
      autoPlayRef.current = true;
      setAutoPlay(true);
      // No immediate roll — user presses Roll to start the first round
    }
  }, [rolling, stopAutoPlayFn]);

  const applyTarget = (t: number) => {
    const c = clampTarget(t);
    setTarget(c);
    setCustomTarget(c < 10 ? c.toFixed(2) : String(c));
  };

  const setTargetPreset = (v: number) => { playClick(); applyTarget(v); };
  const handleCustomTarget = (v: string) => {
    setCustomTarget(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > 0) setTarget(clampTarget(n));
  };

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
    <GamesWrapper balance={balance} name="Limbo" subtitle="Pure Multiplier" gameType="limbo" isPlaying={rolling} stopAutoPlay={stopAutoPlayFn} onDepositClose={refreshBalance} autoPlay={autoPlay}>

      {/* ── Stage ── */}
      <div className="relative min-h-[240px] flex-1 overflow-hidden bg-[radial-gradient(ellipse_70%_60%_at_50%_42%,rgba(34,211,238,0.10)_0%,transparent_70%),linear-gradient(180deg,#05060d_0%,#080a16_100%)]">
        {/* 3D warp field — speed tracks the live multiplier */}
        <LimboWarp phase={warpPhase} multiplier={warpMultiplier} accent="#f29a0b" />

        {/* Soft focal glow behind the readout for depth */}
        <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_47%,rgba(242,154,11,0.10),transparent_42%)]" />

        {/* Result tint */}
        {lastResult && !rolling && (
          <div
            className={`pointer-events-none absolute inset-0 z-[2] transition-opacity duration-500 ${lastResult.won
              ? "bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(94,234,212,0.16),transparent_70%)]"
              : "bg-[radial-gradient(ellipse_70%_70%_at_50%_50%,rgba(255,93,115,0.15),transparent_70%)]"
              }`}
          />
        )}

        <div className="pointer-events-none absolute inset-0 z-[3] flex flex-col items-center justify-center gap-2">
          <div
            className={`font-bp-mono text-[62px] font-bold leading-none tracking-[-2px] transition-colors ${resultColor}`}
            style={{ textShadow: numberGlow }}
          >
            {displayResult !== null ? `${displayResult.toFixed(2)}×` : "1.00×"}
          </div>

          {lastResult && !rolling ? (
            <div
              className={`rounded-full border px-5 py-2 font-bp-mono text-[15px] font-bold ${lastResult.won
                ? "border-bp-win/40 bg-bp-win/15 text-bp-win"
                : "border-bp-lose/40 bg-bp-lose/15 text-bp-lose"
                }`}
            >
              {lastResult.won ? `+PKR ${fmtPKR(profitOnWin)}` : `-PKR ${fmtPKR(amount)}`}
            </div>
          ) : (
            <div className="text-[13px] uppercase tracking-[3px] text-white/30">
              {rolling ? "Rolling…" : `Win at ${target.toFixed(2)}× or higher`}
            </div>
          )}
        </div>
      </div>

      {/* ── Controls ── */}
      <div
        className="flex flex-shrink-0 w-full flex-col gap-3 overflow-y-auto bg-gradient-to-b from-[rgba(8,10,20,0.82)] to-[rgba(10,8,18,1)] px-4 py-4 sm:px-6 lg:w-[420px] lg:flex-1 lg:overflow-y-auto"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >

        {/* Panel 1: Target multiplier */}
        <GlassPanel>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] uppercase tracking-[2px] text-white/45">Target Multiplier</span>
            <span className="font-bp-mono text-2xl font-bold text-bp-accent">{target.toFixed(2)}×</span>
          </div>

          {/* Log-scaled slider */}
          <div className="relative py-2.5">
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full rounded-full bg-gradient-to-r from-bp-accent/50 to-bp-accent" style={{ width: `${sliderPct}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={SLIDER_STEPS}
              step={1}
              value={sliderVal}
              onChange={(e) => applyTarget(targetFromSlider(Number(e.target.value)))}
              disabled={rolling || autoPlay}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
            <div
              className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 bg-[radial-gradient(circle_at_35%_30%,#fff_0%,#f29a0b_80%)] shadow-[0_2px_10px_rgba(242,154,11,0.6)]"
              style={{ left: `${sliderPct}%` }}
            />
          </div>

          {/* Quick targets + custom entry */}
          <div className="mt-3 flex gap-2">
            <div className="grid flex-1 grid-cols-4 gap-2">
              {TARGET_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setTargetPreset(p)}
                  disabled={rolling || autoPlay}
                  className={`min-h-[44px] rounded-2xl border py-2 font-bp-mono text-[16px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${target === p
                    ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent"
                    : "border-white/[0.06] bg-black/25 text-white/75 hover:bg-black/40"
                    }`}
                >
                  {p}×
                </button>
              ))}
            </div>
            <div className="relative w-[104px]">
              <input
                type="number"
                value={customTarget}
                onChange={(e) => handleCustomTarget(e.target.value)}
                disabled={rolling || autoPlay}
                min={MIN_TARGET}
                max={MAX_TARGET}
                step={0.01}
                className="w-full rounded-2xl border border-white/[0.06] bg-black/30 py-2 pl-3 pr-7 font-bp-mono text-[16px] font-bold text-white outline-none focus:border-bp-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/40">×</span>
            </div>
          </div>
        </GlassPanel>

        {/* Panel 2: Bet amount + stats */}
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

          {/* Stats row */}
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3">
            {[
              { label: "Win chance", value: `${winChance.toFixed(2)}%` },
              { label: "Multiplier", value: `${target.toFixed(2)}×`, accent: true },
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
            disabled={rolling || autoRunning}
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
              "Roll"
            )}
          </button>
          <button
            onClick={toggleAutoPlay}
            disabled={!autoPlay && (rolling || amount < 10 || amount > 20000 || amount > balance)}
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
