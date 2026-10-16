"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import GamesWrapper from "@/components/games/games-wrapper";
import { DepositSheet } from "@/components/deposit-sheet";
import { PlinkoBoard } from "./plinko-board";
import { PlinkoScene } from "./plinko-scene";
import { playClick } from "@/lib/sound";
import { getSoundSettings, onSoundSettingsChange } from "@/lib/sound-settings";
import { hapticTap, hapticWin, hapticLoss } from "@/lib/haptics";
import { fireWinConfetti } from "@/lib/confetti";
import {
  type PlinkoRows, type PlinkoRisk, PLINKO_ROWS, PLINKO_RISKS,
  plinkoMultipliers, plinkoMaxMultiplier,
} from "@/lib/games/plinko";

const PRESETS = [100, 500, 1000, 5000] as const;
const MIN_BET = 10;
const MAX_BET = 20000;
const RECENT_MAX = 14;

interface BetResponse {
  path: ("L" | "R")[];
  bucket: number;
  multiplier: number;
  payout: number;
  profit: number;
  won: boolean;
  newBalance: number;
  error?: string;
}

interface RecentRound { mult: number; }

const RISK_LABEL: Record<PlinkoRisk, string> = { low: "Low", medium: "Medium", high: "High" };

function fmtPKR(n: number) {
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PlinkoGame({ initialBalance = 12500 }: { initialBalance?: number }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [balance, setBalance] = useState(initialBalance);
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState("100");
  const [rows, setRows] = useState<PlinkoRows>(12);
  const [risk, setRisk] = useState<PlinkoRisk>("medium");

  const [dropping, setDropping] = useState(false);
  const [path, setPath] = useState<("L" | "R")[] | null>(null);
  const [dropToken, setDropToken] = useState(0);
  const [landedBucket, setLandedBucket] = useState<number | null>(null);
  const [lastMult, setLastMult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentRound[]>([]);

  // Result held until the ball lands, then applied in onLanded.
  const pendingRef = useRef<BetResponse | null>(null);
  // Synchronous re-entry guard — blocks a second real-money POST from rapid clicks
  // before the `dropping` state flush disables the button.
  const droppingRef = useRef(false);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const loseAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── Autoplay ──
  // `autoPlay` = armed (user toggled Auto on); the chain starts on the next
  // Drop press. `autoRunning` = a follow-up drop is scheduled between balls.
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const autoPlayRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef = useRef<() => void>(() => { });
  const amountRef = useRef(amount);
  useEffect(() => { amountRef.current = amount; }, [amount]);

  const mults = plinkoMultipliers(rows, risk);
  const maxMult = plinkoMaxMultiplier(rows, risk);
  // Lock config while a ball is in flight OR autoplay is armed.
  const locked = dropping || autoPlay;

  useEffect(() => {
    const sfx = getSoundSettings().sfx;
    winAudioRef.current = new Audio("/sounds/win.mp3");
    loseAudioRef.current = new Audio("/sounds/loss.mp3");
    [winAudioRef.current, loseAudioRef.current].forEach((a) => { if (a) a.volume = sfx; });
    return () => { winAudioRef.current?.pause(); loseAudioRef.current?.pause(); };
  }, []);
  useEffect(() => onSoundSettingsChange((s) => {
    [winAudioRef.current, loseAudioRef.current].forEach((a) => { if (a) a.volume = s.sfx; });
  }), []);

  const playAudio = (ref: React.RefObject<HTMLAudioElement | null>) => {
    if (!ref.current) return;
    ref.current.currentTime = 0;
    ref.current.play().catch(() => { });
  };

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/summary", { cache: "no-store" });
      if (res.ok) { const data = await res.json(); setBalance(data.balance); }
    } catch { /* silent */ }
  }, []);

  // Called by the board when the ball reaches its bucket — settle the result.
  const onLanded = useCallback(() => {
    const data = pendingRef.current;
    pendingRef.current = null;
    droppingRef.current = false;
    if (!data) { setDropping(false); return; }
    setLandedBucket(data.bucket);
    setLastMult(data.multiplier);
    setBalance(data.newBalance);
    setRecents((r) => [{ mult: data.multiplier }, ...r].slice(0, RECENT_MAX));
    if (data.won) { hapticWin(); playAudio(winAudioRef); if (data.multiplier >= 2) fireWinConfetti(); }
    else { hapticLoss(); playAudio(loseAudioRef); }
    setDropping(false);
    // Chain the next autoplay drop — stop if the balance can't cover the bet.
    if (autoPlayRef.current) {
      if (data.newBalance >= amountRef.current && amountRef.current >= MIN_BET) {
        setAutoRunning(true);
        autoTimerRef.current = setTimeout(() => {
          autoTimerRef.current = null;
          if (autoPlayRef.current) dropRef.current();
        }, 800);
      } else {
        autoPlayRef.current = false;
        setAutoPlay(false);
        setAutoRunning(false);
      }
    }
  }, []);

  const drop = useCallback(async () => {
    if (droppingRef.current) return;
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
    setAutoRunning(false);
    playClick();
    if (amount > MAX_BET) { setError("Max bet is PKR 20,000."); return; }
    if (amount < MIN_BET || amount > balance) { setDepositOpen(true); return; }

    droppingRef.current = true;
    hapticTap();
    setError(null);
    setDropping(true);
    setLandedBucket(null);
    setLastMult(null);

    try {
      const res = await fetch("/api/games/plinko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, rows, risk }),
      });
      const data: BetResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bet failed");
      // Hand the path to the board and start the animation; settle in onLanded.
      pendingRef.current = data;
      setPath(data.path);
      setDropToken((t) => t + 1);
    } catch (e: unknown) {
      droppingRef.current = false;
      autoPlayRef.current = false;
      setAutoPlay(false);
      setAutoRunning(false);
      setError(e instanceof Error ? e.message : "Error placing bet");
      setDropping(false);
    }
  }, [amount, balance, rows, risk]);

  // Keep dropRef pointing at the latest drop (avoids stale closure in the auto timer)
  useEffect(() => { dropRef.current = drop; }, [drop]);

  const stopAutoPlayFn = useCallback(() => {
    autoPlayRef.current = false;
    setAutoPlay(false);
    setAutoRunning(false);
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
  }, []);

  // Cleanup autoplay on unmount
  useEffect(() => () => { stopAutoPlayFn(); }, [stopAutoPlayFn]);

  const toggleAutoPlay = useCallback(() => {
    playClick();
    if (autoPlayRef.current) {
      stopAutoPlayFn();
    } else {
      if (droppingRef.current) return;
      autoPlayRef.current = true;
      setAutoPlay(true);
      // Armed only — the user presses Drop to start the chain.
    }
  }, [stopAutoPlayFn]);

  const setPreset = (v: number) => { playClick(); setAmount(v); setCustomAmount(String(v)); };
  const handleCustom = (v: string) => {
    setCustomAmount(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > 0) setAmount(n);
  };
  const half = () => { playClick(); const n = Math.max(MIN_BET, parseFloat((amount / 2).toFixed(2))); setAmount(n); setCustomAmount(String(n)); };
  const double = () => { playClick(); const n = Math.min(MAX_BET, parseFloat((amount * 2).toFixed(2))); setAmount(n); setCustomAmount(String(n)); };

  return (
    <>
      <GamesWrapper
        balance={balance}
        name="Plinko"
        subtitle={`Up to ${maxMult}×`}
        gameType="plinko"
        isPlaying={dropping}
        stopAutoPlay={stopAutoPlayFn}
        autoPlay={autoPlay}
        onDepositClose={refreshBalance}
      >
        {/* ── Stage ── */}
        <div className="relative flex min-h-[280px] flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_70%_at_50%_30%,rgba(139,92,246,0.14)_0%,transparent_65%),linear-gradient(180deg,#0a0816_0%,#0b0a18_100%)]">

          {/* 3D nebula-rain backdrop — intensifies while a ball is in flight */}
          <PlinkoScene active={locked} />

          {/* Recent + last multiplier */}
          <div className="z-10 flex items-center justify-between gap-2 px-3 pt-3">
            <div className="flex max-w-[68%] items-center gap-1.5 overflow-hidden rounded-full border border-white/[0.06] bg-black/45 px-2.5 py-1.5 backdrop-blur">
              <span className="mr-1 shrink-0 text-[9px] font-black uppercase tracking-[2px] text-white/45">Recent</span>
              <div className="flex gap-1.5 overflow-hidden">
                {recents.length === 0 ? (
                  <span className="text-[10px] text-white/25">No drops yet</span>
                ) : recents.map((r, i) => (
                  <div key={i} className={`shrink-0 rounded-full border px-2 py-0.5 font-bp-mono text-[10px] font-black ${r.mult > 1 ? "border-bp-win/50 bg-bp-win/15 text-bp-win" : r.mult === 1 ? "border-white/15 bg-white/[0.06] text-white/60" : "border-bp-lose/50 bg-bp-lose/15 text-bp-lose"}`}>
                    {r.mult}×
                  </div>
                ))}
              </div>
            </div>
            <div className={`shrink-0 rounded-full border px-3 py-1 font-bp-mono text-[13px] font-black ${lastMult == null ? "border-white/10 bg-black/40 text-white/40" : lastMult > 1 ? "border-bp-win/50 bg-bp-win/15 text-bp-win" : "border-bp-lose/50 bg-bp-lose/15 text-bp-lose"}`}>
              {lastMult == null ? "—" : `${lastMult}×`}
            </div>
          </div>

          {/* Board */}
          <div className="relative z-[1] min-h-0 flex-1 px-2 py-2">
            <PlinkoBoard
              rows={rows}
              mults={mults}
              path={path}
              dropToken={dropToken}
              landedBucket={landedBucket}
              onLanded={onLanded}
            />
          </div>
        </div>

        {/* ── Controls ── */}
        <div
          className="flex w-full flex-shrink-0 flex-col gap-2.5 border-t border-white/[0.06] bg-gradient-to-b from-[rgba(8,10,20,0.82)] to-[rgba(10,8,18,1)] px-3 pt-3 lg:w-[380px] lg:border-l lg:border-t-0 lg:gap-3 lg:overflow-y-auto lg:py-3"
          style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
        >
          {/* Risk */}
          <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 ${locked ? "pointer-events-none opacity-55" : ""}`}>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[1.5px] text-white/55">Risk</div>
            <div className="relative grid grid-cols-3 rounded-2xl border border-white/[0.04] bg-black/35 p-1.5">
              <div
                className={`absolute bottom-1.5 top-1.5 rounded-xl bg-gradient-to-b from-bp-accent to-[#c97e08] shadow-[0_2px_16px_rgba(242,154,11,0.4)] transition-all duration-300`}
                style={{ left: `calc(${PLINKO_RISKS.indexOf(risk)} * (100% - 0.75rem)/3 + 0.375rem)`, width: `calc((100% - 0.75rem)/3)` }}
              />
              {PLINKO_RISKS.map((rk) => (
                <button
                  key={rk}
                  onClick={() => { playClick(); setRisk(rk); }}
                  disabled={locked}
                  className={`relative z-[1] min-h-[40px] rounded-xl py-2 text-[15px] font-extrabold uppercase tracking-wide transition-colors disabled:cursor-not-allowed ${risk === rk ? "text-[#1b1305]" : "text-white/55"}`}
                >
                  {RISK_LABEL[rk]}
                </button>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 ${locked ? "pointer-events-none opacity-55" : ""}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-[1.5px] text-white/55">Rows</span>
              <span className="font-bp-mono text-[15px] font-black text-bp-accent">{rows}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PLINKO_ROWS.map((n) => (
                <button
                  key={n}
                  onClick={() => { playClick(); setRows(n); }}
                  disabled={locked}
                  className={`min-h-[40px] rounded-xl border py-2 font-bp-mono text-[16px] font-bold transition-colors disabled:cursor-not-allowed ${rows === n ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent" : "border-white/[0.06] bg-black/25 text-white/70 hover:bg-black/40"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Bet amount */}
          <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 ${locked ? "pointer-events-none opacity-55" : ""}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-[1.5px] text-white/55">Bet Amount</span>
              <span className="font-bp-mono text-[12px] font-semibold text-white/35">PKR</span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={customAmount}
                onChange={(e) => handleCustom(e.target.value)}
                disabled={locked}
                min={MIN_BET}
                max={MAX_BET}
                className="flex-1 rounded-xl border border-white/[0.06] bg-black/30 py-3 px-3 font-bp-mono text-[16px] font-bold text-white outline-none focus:border-bp-accent/40 disabled:opacity-60"
              />
              <button onClick={half} disabled={locked} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 font-bp-mono text-[16px] font-bold text-white/85 hover:bg-black/40 disabled:opacity-60">½</button>
              <button onClick={double} disabled={locked} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 font-bp-mono text-[16px] font-bold text-white/85 hover:bg-black/40 disabled:opacity-60">2×</button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  disabled={locked}
                  className={`rounded-lg border py-2 font-bp-mono text-[16px] font-bold transition-colors disabled:opacity-60 ${amount === p ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent" : "border-white/[0.06] bg-black/25 text-white/70 hover:bg-black/40"}`}
                >
                  {p >= 1000 ? `${p / 1000}k` : p}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-bp-lose/30 bg-bp-lose/10 px-4 py-2.5 text-center text-sm text-bp-lose">{error}</div>
          )}

          <div className="flex gap-2.5">
            <button
              onClick={drop}
              disabled={dropping || autoRunning}
              className="flex-1 rounded-2xl border-0 bg-gradient-to-b from-bp-accent to-[#c97e08] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-[#1b1305] shadow-[0_4px_18px_rgba(242,154,11,0.45)] transition-all hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:text-[17px]"
            >
              {dropping ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1b1305]/30 border-t-[#1b1305]" />
                  {autoPlay ? "Auto…" : "Dropping…"}
                </span>
              ) : autoRunning ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#1b1305]/70" />
                  Next Drop…
                </span>
              ) : (
                <>Drop <span className="font-bp-mono opacity-90">PKR {fmtPKR(amount)}</span></>
              )}
            </button>
            <button
              onClick={toggleAutoPlay}
              disabled={!autoPlay && (dropping || amount < MIN_BET || amount > MAX_BET || amount > balance)}
              className={`min-w-[72px] rounded-2xl border py-4 font-bp-ui text-[14px] font-black uppercase tracking-[1.5px] transition-all sm:text-[15px] ${autoPlay
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

export default PlinkoGame;
