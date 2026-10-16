"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import GamesWrapper from "../games-wrapper";
import { DepositSheet } from "@/components/deposit-sheet";
import { playClick } from "@/lib/sound";
import { getSoundSettings, onSoundSettingsChange } from "@/lib/sound-settings";
import { hapticTap, hapticWin, hapticLoss } from "@/lib/haptics";
import { fireWinConfetti } from "@/lib/confetti";

const CoinThreeCanvas = dynamic(
  () => import("./coin-canvas").then((m) => m.CoinThreeCanvas),
  { ssr: false }
);

const PRESETS = [100, 500, 1000, 5000] as const;
const MULTIPLIER = 1.96;
const WIN_CHANCE = 50;

type Side = "heads" | "tails";

interface BetResponse {
  outcome: { result: Side };
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

function CrownMini({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M3 18 L5 7 L9 12 L12 5 L15 12 L19 7 L21 18 Z" />
      <rect x="3" y="18.5" width="18" height="2.5" rx="0.6" />
    </svg>
  );
}

function StarMini({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 3 L13.6 10 L21 9 L15.5 13 L21 17 L13.6 16 L12 23 L10.4 16 L3 17 L8.5 13 L3 9 L10.4 10 Z" />
    </svg>
  );
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

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-center">
      <div className="text-[11px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div
        className={`mt-1 font-bp-mono text-[18px] font-bold sm:text-[20px] ${accent ? "text-bp-accent" : "text-white"}`}
      >
        {value}
      </div>
    </div>
  );
}

export function CoinflipGame({ initialBalance }: { initialBalance: number }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [pick, setPick] = useState<Side>("heads");
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState("100");
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<Side | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const autoPlayRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flipRef = useRef<() => void>(() => { });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const loseAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const sfxVol = getSoundSettings().sfx;
    audioRef.current = new Audio("/sounds/coin-flip/coin-flip.mp3");
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
    const bg = new Audio("/sounds/coin-flip/bg-sound.mp3");
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

  const profitOnWin = parseFloat((amount * MULTIPLIER - amount).toFixed(2));

  const flip = useCallback(async () => {
    if (flipping) return;
    // Clear any pending auto timer (handles both manual clicks during gap and auto-fired rounds)
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
    setFlipping(true);
    setError(null);
    setResult(null);
    setWon(null);

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      // audioRef.current.loop = true;
      audioRef.current.play().catch(() => { });
    }

    try {
      const res = await fetch("/api/games/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: "coinflip",
          amount,
          choice: { pick },
        }),
      });

      const data: BetResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bet failed");

      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.loop = false;
          audioRef.current.pause();
        }
        const outcomeAudio = data.won ? winAudioRef.current : loseAudioRef.current;
        if (outcomeAudio) { outcomeAudio.currentTime = 0; outcomeAudio.play().catch(() => { }); }
        data.won ? hapticWin() : hapticLoss();
        if (data.won) fireWinConfetti();
        setResult(data.outcome.result);
        setWon(data.won);
        setBalance(data.newBalance);
        setFlipping(false);
        if (autoPlayRef.current) {
          if (data.newBalance >= amount) {
            setAutoRunning(true);
            autoTimerRef.current = setTimeout(() => {
              autoTimerRef.current = null;
              if (autoPlayRef.current) flipRef.current();
            }, 1500);
          } else {
            autoPlayRef.current = false;
            setAutoPlay(false);
            setAutoRunning(false);
          }
        }
      }, 1500);
    } catch (e: unknown) {
      if (audioRef.current) {
        audioRef.current.loop = false;
        audioRef.current.pause();
      }
      autoPlayRef.current = false;
      setAutoPlay(false);
      setAutoRunning(false);
      setError(e instanceof Error ? e.message : "Error placing bet");
      setFlipping(false);
    }
  }, [amount, balance, flipping, pick]);

  // Keep flipRef pointing at the latest flip (avoids stale closure in auto timer)
  useEffect(() => { flipRef.current = flip; }, [flip]);


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
      if (flipping) return;
      autoPlayRef.current = true;
      setAutoPlay(true);
      // No immediate flip — user must press Flip Coin to start the first round
    }
  }, [flipping, stopAutoPlayFn]);

  const setPreset = (v: number) => {
    playClick();
    setAmount(v);
    setCustomAmount(String(v));
  };

  const handleCustom = (v: string) => {
    setCustomAmount(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > 0) setAmount(n);
  };

  const half = () => {
    playClick();
    const n = Math.max(10, parseFloat((amount / 2).toFixed(2)));
    setAmount(n);
    setCustomAmount(String(n));
  };

  const double = () => {
    playClick();
    const n = Math.min(20000, parseFloat((amount * 2).toFixed(2)));
    setAmount(n);
    setCustomAmount(String(n));
  };

  const labelText = flipping ? "—— ——" : result ? result : "READY";

  const labelColor =
    won == null ? "text-bp-text" : won ? "text-bp-win" : "text-bp-lose";

  return (
    <>
    <GamesWrapper balance={balance} name="Coin Flip" gameType="coinflip" isPlaying={flipping} stopAutoPlay={stopAutoPlayFn} onDepositClose={refreshBalance} autoPlay={autoPlay}>
      {/* Stage */}
      <div className="relative min-h-[240px] flex-1 overflow-hidden bg-[radial-gradient(ellipse_80%_70%_at_50%_60%,rgba(242,154,11,0.14)_0%,transparent_70%),radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(100,80,200,0.12)_0%,transparent_60%),linear-gradient(180deg,#0a0812_0%,#0c0918_100%)]">
        <div className="absolute inset-0">
          <CoinThreeCanvas result={result} flipping={flipping} />
        </div>

        <div className="pointer-events-none absolute bottom-6 left-0 right-0 z-[3] flex flex-col items-center gap-1.5">
          <div
            className={`font-bp-mono text-[52px] font-bold uppercase leading-none tracking-[-2px] ${labelColor}`}
          >
            {labelText}
          </div>

          {result && !flipping ? (
            <div
              className={`rounded-full border px-5 py-2 font-bp-mono text-[15px] font-bold ${won
                ? "border-bp-win/40 bg-bp-win/15 text-bp-win"
                : "border-bp-lose/40 bg-bp-lose/15 text-bp-lose"
                }`}
            >
              {won
                ? `+PKR ${fmtPKR(profitOnWin)}`
                : `-PKR ${fmtPKR(amount)}`}
            </div>
          ) : (
            <div className="text-[14px] uppercase tracking-[3px] text-white/30">
              {flipping ? "Flipping…" : `Bet on ${pick}`}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div
        className="flex flex-shrink-0 w-full flex-col gap-3 overflow-y-auto bg-gradient-to-b from-[rgba(8,10,20,0.82)] to-[rgba(10,8,18,1)] px-4 py-4 sm:gap-4 sm:px-6 sm:py-5 lg:w-[420px] lg:flex-1 lg:overflow-y-auto"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <GlassPanel>
          <div className="mb-3 text-[12px] uppercase tracking-[2px] text-white/45">
            Your Pick
          </div>

          <div className="relative grid grid-cols-2 rounded-3xl border border-white/[0.04] bg-black/35 p-1.5">
            <div
              className={`absolute bottom-1.5 top-1.5 rounded-2xl bg-gradient-to-b from-bp-accent to-[#c97e08] shadow-[0_2px_16px_rgba(242,154,11,0.4)] transition-all duration-300 ${pick === "heads"
                ? "left-1.5 right-[50%]"
                : "left-[50%] right-1.5"
                }`}
            />

            {[
              { id: "heads" as Side, label: "Heads", Glyph: CrownMini },
              { id: "tails" as Side, label: "Tails", Glyph: StarMini },
            ].map(({ id, label, Glyph }) => (
              <button
                key={id}
                onClick={() => { playClick(); setPick(id); }}
                disabled={flipping || autoPlay}
                className={`relative z-[1] flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border-0 bg-transparent py-3 text-[17px] font-extrabold uppercase tracking-wider transition-colors disabled:cursor-not-allowed sm:py-4 sm:text-[18px] ${pick === id ? "text-[#1b1305]" : "text-white/55"
                  }`}
              >
                <Glyph className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel>
          <div className="mb-3 text-[12px] uppercase tracking-[2px] text-white/45">
            Bet Amount
          </div>

          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                disabled={flipping || autoPlay}
                className={`min-h-[44px] rounded-2xl border py-2 font-bp-mono text-[17px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:py-3 sm:text-[17px] ${amount === p
                  ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent"
                  : "border-white/[0.06] bg-black/25 text-white/75 hover:bg-black/40"
                  }`}
              >
                {p >= 1000 ? `${p / 1000}k` : p}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-white/40">
                PKR
              </span>
              <input
                type="number"
                value={customAmount}
                onChange={(e) => handleCustom(e.target.value)}
                disabled={flipping || autoPlay}
                min={10}
                max={20000}
                className="w-full rounded-2xl border border-white/[0.06] bg-black/30 py-3.5 pl-14 pr-3 font-bp-mono text-[17px] font-bold text-white outline-none focus:border-bp-accent/40 disabled:cursor-not-allowed disabled:opacity-60 sm:py-4 sm:text-[18px]"
              />
            </div>

            <button
              onClick={half}
              disabled={flipping || autoPlay}
              className="min-h-[44px] min-w-[64px] rounded-2xl border border-white/[0.06] bg-black/30 px-3 font-bp-mono text-[18px] font-bold text-white/85 hover:bg-black/40 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[72px] sm:px-4 sm:text-[20px]"
            >
              ½
            </button>

            <button
              onClick={double}
              disabled={flipping || autoPlay}
              className="min-h-[44px] min-w-[64px] rounded-2xl border border-white/[0.06] bg-black/30 px-3 font-bp-mono text-[18px] font-bold text-white/85 hover:bg-black/40 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[72px] sm:px-4 sm:text-[20px]"
            >
              2×
            </button>
          </div>
        </GlassPanel>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard label="Win chance" value={`${WIN_CHANCE}%`} />
          <StatCard
            label="Multiplier"
            value={`${MULTIPLIER.toFixed(2)}×`}
            accent
          />
          <StatCard
            label="Profit"
            value={`+${profitOnWin >= 1000
              ? `${(profitOnWin / 1000).toFixed(1)}k`
              : profitOnWin.toFixed(0)
              }`}
          />
        </div>

        {error && (
          <div className="rounded-2xl border border-bp-lose/30 bg-bp-lose/10 px-4 py-3 text-center text-sm text-bp-lose sm:text-[15px]">
            {error}
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={flip}
            disabled={flipping || autoRunning}
            className="flex-1 rounded-3xl border-0 bg-gradient-to-b from-bp-accent to-[#c97e08] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-[#1b1305] shadow-[0_4px_18px_rgba(242,154,11,0.45)] transition-all hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:py-5 sm:text-[17px]"
          >
            {flipping ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1b1305]/30 border-t-[#1b1305]" />
                {autoPlay ? "Auto…" : "Flipping…"}
              </span>
            ) : autoRunning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#1b1305]/70" />
                Next Round…
              </span>
            ) : (
              "Flip Coin"
            )}
          </button>
          <button
            onClick={toggleAutoPlay}
            disabled={!autoPlay && (flipping || amount < 10 || amount > 20000 || amount > balance)}
            className={`min-w-[72px] rounded-3xl border py-4 font-bp-ui text-[13px] font-black uppercase tracking-[1.5px] transition-all sm:py-5 sm:text-[14px] ${autoPlay
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
