"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GamesWrapper from "@/components/games/games-wrapper";
import { DepositSheet } from "@/components/deposit-sheet";
import { playClick } from "@/lib/sound";
import { getSoundSettings, onSoundSettingsChange } from "@/lib/sound-settings";
import { hapticTap, hapticWin, hapticLoss } from "@/lib/haptics";
import { fireWinConfetti } from "@/lib/confetti";
import { KENO_POOL, KENO_MAX_PICKS, KENO_PAYTABLE } from "@/lib/games/keno";
import { KenoScene, type KenoFx, type KenoFxKind } from "./keno-scene";

const PRESETS = [100, 500, 1000, 5000] as const;
const MIN_BET = 10;
const MAX_BET = 20000;
const RECENT_MAX = 10;
const REVEAL_MS = 170;

type Phase = "idle" | "playing" | "done";

interface BetResponse {
  outcome: { picks: number[]; draw: number[]; hits: number };
  multiplier: number;
  won: boolean;
  newBalance: number;
  error?: string;
}

interface ResultState { draw: number[]; hits: number; multiplier: number; won: boolean; newBalance: number; }
interface RecentRound { hits: number; k: number; won: boolean; }

function fmtPKR(n: number) {
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMult(m: number) {
  return m >= 100 ? `${Math.round(m)}` : m % 1 === 0 ? `${m}` : m.toFixed(m < 10 ? 1 : 0);
}

export function KenoGame({ initialBalance = 12500 }: { initialBalance?: number }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [balance, setBalance] = useState(initialBalance);
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState("100");
  const [picks, setPicks] = useState<number[]>([]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ResultState | null>(null);
  const [revealCount, setRevealCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentRound[]>([]);

  const playingRef = useRef(false);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const loseAudioRef = useRef<HTMLAudioElement | null>(null);

  // One-shot FX events for the Three.js lottery scene.
  const [fx, setFx] = useState<KenoFx>(null);
  const fxSeqRef = useRef(0);
  const pushFx = useCallback((kind: KenoFxKind) => {
    setFx({ kind, seq: ++fxSeqRef.current });
  }, []);

  const k = picks.length;
  const playing = phase === "playing";
  const paytable = KENO_PAYTABLE[k] ?? null;
  const pickSet = useMemo(() => new Set(picks), [picks]);
  const drawnSoFar = useMemo(
    () => (result ? result.draw.slice(0, revealCount) : []),
    [result, revealCount],
  );
  const drawnSet = useMemo(() => new Set(drawnSoFar), [drawnSoFar]);
  const liveHits = drawnSoFar.filter((n) => pickSet.has(n)).length;

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
  useEffect(() => () => {
    if (revealTimerRef.current) clearInterval(revealTimerRef.current);
    playingRef.current = false; // belt-and-suspenders: never leave the guard stuck on unmount
  }, []);

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

  const settle = useCallback((r: ResultState, kCount: number) => {
    setBalance(r.newBalance);
    setRecents((prev) => [{ hits: r.hits, k: kCount, won: r.won }, ...prev].slice(0, RECENT_MAX));
    if (r.won) { hapticWin(); playAudio(winAudioRef); if (r.multiplier >= 5) fireWinConfetti(); }
    else { hapticLoss(); playAudio(loseAudioRef); }
    pushFx(r.won ? "win" : "lose");
    setPhase("done");
    playingRef.current = false;
  }, [pushFx]);

  const play = useCallback(async () => {
    if (playingRef.current) return;
    playClick();
    if (picks.length < 1) { setError("Pick at least 1 number."); return; }
    if (amount > MAX_BET) { setError("Max bet is PKR 20,000."); return; }
    if (amount < MIN_BET || amount > balance) { setDepositOpen(true); return; }

    playingRef.current = true;
    hapticTap();
    setError(null);
    setResult(null);
    setRevealCount(0);
    setPhase("playing");

    const kCount = picks.length;
    try {
      const res = await fetch("/api/games/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType: "keno", amount, choice: { picks } }),
      });
      const data: BetResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bet failed");

      const r: ResultState = {
        draw: data.outcome.draw,
        hits: data.outcome.hits,
        multiplier: data.multiplier,
        won: data.won,
        newBalance: data.newBalance,
      };
      setResult(r);

      // Reveal the drawn numbers one at a time, then settle.
      const pset = new Set(picks);
      let i = 0;
      revealTimerRef.current = setInterval(() => {
        i += 1;
        setRevealCount(i);
        playClick();
        // Teal burst when the drawn number hits one of your picks.
        pushFx(pset.has(r.draw[i - 1]) ? "hit" : "reveal");
        if (i >= r.draw.length) {
          if (revealTimerRef.current) clearInterval(revealTimerRef.current);
          revealTimerRef.current = null;
          settle(r, kCount);
        }
      }, REVEAL_MS);
    } catch (e: unknown) {
      playingRef.current = false;
      setError(e instanceof Error ? e.message : "Error placing bet");
      setPhase("idle");
    }
  }, [picks, amount, balance, settle, pushFx]);

  // Toggling a number — clears a finished round's reveal first.
  const togglePick = (n: number) => {
    if (!Number.isInteger(n) || n < 1 || n > KENO_POOL) return;
    if (playing) return;
    if (phase === "done") { setResult(null); setRevealCount(0); setPhase("idle"); }
    playClick();
    setPicks((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= KENO_MAX_PICKS) return prev;
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const quickPick = () => {
    if (playing) return;
    if (phase === "done") { setResult(null); setRevealCount(0); setPhase("idle"); }
    playClick();
    const pool = Array.from({ length: KENO_POOL }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setPicks(pool.slice(0, KENO_MAX_PICKS).sort((a, b) => a - b));
  };

  const clearPicks = () => {
    if (playing) return;
    playClick();
    setResult(null); setRevealCount(0); setPhase("idle");
    setPicks([]);
  };

  const setPreset = (v: number) => { playClick(); setAmount(v); setCustomAmount(String(v)); };
  const handleCustom = (v: string) => {
    setCustomAmount(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > 0) setAmount(n);
  };
  const half = () => { playClick(); const n = Math.max(MIN_BET, parseFloat((amount / 2).toFixed(2))); setAmount(n); setCustomAmount(String(n)); };
  const double = () => { playClick(); const n = Math.min(MAX_BET, parseFloat((amount * 2).toFixed(2))); setAmount(n); setCustomAmount(String(n)); };

  // Cell visual state.
  const cellClass = (n: number): string => {
    const picked = pickSet.has(n);
    const drawn = drawnSet.has(n);
    if (picked && drawn) return "border-bp-win/70 bg-[linear-gradient(180deg,rgba(94,234,212,0.28),rgba(94,234,212,0.10))] text-bp-win shadow-[0_0_16px_rgba(94,234,212,0.45),inset_0_1px_0_rgba(255,255,255,0.15)]"; // hit
    if (drawn) return "border-indigo-300/40 bg-[linear-gradient(180deg,rgba(142,162,255,0.22),rgba(142,162,255,0.07))] text-indigo-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"; // drawn, not picked
    if (picked && phase === "done") return "border-bp-lose/40 bg-bp-lose/[0.08] text-bp-lose/80"; // miss
    if (picked) return "border-bp-accent/60 bg-[linear-gradient(180deg,rgba(242,154,11,0.20),rgba(242,154,11,0.07))] text-bp-accent shadow-[0_0_12px_rgba(242,154,11,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]"; // selected
    return "border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] text-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/25 hover:text-white";
  };

  // Reveal choreography: hits pop with overshoot, plain draws scale in.
  const cellAnim = (n: number): string | undefined => {
    const drawn = drawnSet.has(n);
    if (!drawn) return undefined;
    return pickSet.has(n)
      ? "kn-hit .5s cubic-bezier(.2,1.5,.4,1)"
      : "kn-draw .35s ease-out";
  };

  return (
    <>
      <GamesWrapper
        balance={balance}
        name="Keno"
        subtitle="Pick · Draw · Match"
        gameType="keno"
        isPlaying={playing}
        onDepositClose={refreshBalance}
      >
        {/* ── Stage ── */}
        <div className="relative flex min-h-[300px] flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_25%,rgba(99,102,241,0.16)_0%,transparent_65%),linear-gradient(180deg,#070912_0%,#0a0a18_100%)]">

          {/* 3D lottery scene: tumbling numbered balls + draw/hit bursts */}
          <KenoScene phase={phase} fx={fx} />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_130%_100%_at_50%_50%,transparent_55%,rgba(0,0,0,0.5)_100%)]" />

          {/* Result stamp */}
          {phase === "done" && result && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div
                className={`rounded-2xl border-2 px-7 py-3 text-center backdrop-blur-[3px] ${result.won
                  ? "border-bp-win/70 bg-[#062e26]/60 shadow-[0_0_48px_rgba(94,234,212,0.35)]"
                  : "border-bp-lose/70 bg-[#2e0610]/60 shadow-[0_0_48px_rgba(255,93,115,0.35)]"}`}
                style={{ animation: "kn-stamp .4s cubic-bezier(.2,1.6,.4,1) backwards", transform: "rotate(-5deg)" }}
              >
                <div className={`text-[10px] font-black uppercase tracking-[4px] ${result.won ? "text-bp-win/80" : "text-bp-lose/80"}`}>
                  {result.hits}/{k} Hits · {fmtMult(result.multiplier)}×
                </div>
                <div className={`font-bp-mono text-[24px] font-black leading-tight tracking-[1px] ${result.won ? "text-bp-win" : "text-bp-lose"}`}>
                  {result.won ? `+PKR ${fmtPKR(amount * result.multiplier - amount)}` : `−PKR ${fmtPKR(amount)}`}
                </div>
              </div>
            </div>
          )}

          {/* Recent + status */}
          <div className="z-10 flex items-center justify-between gap-2 px-3 pt-3">
            <div className="flex max-w-[64%] items-center gap-1.5 overflow-hidden rounded-full border border-white/[0.06] bg-black/45 px-2.5 py-1.5 backdrop-blur">
              <span className="mr-1 shrink-0 text-[9px] font-black uppercase tracking-[2px] text-white/45">Recent</span>
              <div className="flex gap-1.5 overflow-hidden">
                {recents.length === 0 ? (
                  <span className="text-[10px] text-white/25">No rounds yet</span>
                ) : recents.map((r, i) => (
                  <div key={i} className={`shrink-0 rounded-full border px-2 py-0.5 font-bp-mono text-[10px] font-black ${r.won ? "border-bp-win/50 bg-bp-win/15 text-bp-win" : "border-bp-lose/50 bg-bp-lose/15 text-bp-lose"}`}>
                    {r.hits}/{r.k}
                  </div>
                ))}
              </div>
            </div>
            <div className="shrink-0 rounded-full border border-white/[0.06] bg-black/45 px-3 py-1 font-bp-mono text-[12px] font-bold text-white/70 backdrop-blur">
              {phase === "idle" ? `${k}/${KENO_MAX_PICKS} picked` : `${liveHits} hit${liveHits === 1 ? "" : "s"}`}
            </div>
          </div>

          {/* Result banner */}
          <div className="z-[1] flex flex-col items-center px-3 pt-2 pb-1 pointer-events-none">
            <div className={`font-bp-mono text-[34px] sm:text-[44px] font-black leading-none tracking-[-.04em] ${phase === "done" ? (result?.won ? "text-bp-win drop-shadow-[0_0_20px_rgba(94,234,212,.4)]" : "text-bp-lose") : "text-white/80"}`}>
              {result ? `${fmtMult(result.multiplier)}×` : "—"}
            </div>
            <div className="mt-0.5 min-h-4 text-center text-[11px] font-bold uppercase tracking-[2px] text-white/45">
              {phase === "done" && result
                ? (result.won ? `+PKR ${fmtPKR(amount * result.multiplier - amount)}` : `${result.hits}/${k} hits · −PKR ${fmtPKR(amount)}`)
                : playing ? "Drawing…" : k === 0 ? "Pick 1–10 numbers" : `Hit your numbers to win`}
            </div>
          </div>

          {/* Number grid */}
          <div className="relative z-[1] min-h-0 flex-1 px-3 pb-2">
            <div className="mx-auto grid h-full max-w-[460px] grid-cols-8 gap-1.5 sm:gap-2">
              {Array.from({ length: KENO_POOL }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => togglePick(n)}
                  disabled={playing}
                  className={`flex items-center justify-center rounded-xl border font-bp-mono text-[15px] font-bold transition-all disabled:cursor-default active:scale-95 sm:text-[16px] ${cellClass(n)}`}
                  style={{ animation: cellAnim(n) }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Controls ── */}
        <div
          className="flex w-full flex-shrink-0 flex-col gap-2.5 border-t border-white/[0.06] bg-gradient-to-b from-[rgba(8,10,20,0.82)] to-[rgba(10,8,18,1)] px-3 pt-3 lg:w-[380px] lg:border-l lg:border-t-0 lg:gap-3 lg:overflow-y-auto lg:py-3"
          style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
        >
          {/* Pick controls */}
          <div className="flex gap-2">
            <button
              onClick={quickPick}
              disabled={playing}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 font-bp-ui text-[14px] font-black uppercase tracking-wide text-white/75 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Quick Pick
            </button>
            <button
              onClick={clearPicks}
              disabled={playing || k === 0}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 font-bp-ui text-[14px] font-black uppercase tracking-wide text-white/75 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
          </div>

          {/* Live paytable */}
          {paytable && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-[1.5px] text-white/55">Payouts · {k} pick{k === 1 ? "" : "s"}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {paytable.map((m, h) => (m > 0 ? (
                  <div
                    key={h}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 font-bp-mono text-[11px] font-bold ${phase === "done" && result?.hits === h ? "border-bp-win/60 bg-bp-win/20 text-bp-win" : "border-white/[0.06] bg-black/25 text-white/65"}`}
                  >
                    <span className="text-white/40">{h}</span>
                    <span>{fmtMult(m)}×</span>
                  </div>
                ) : null))}
              </div>
            </div>
          )}

          {/* Bet amount */}
          <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 ${playing ? "pointer-events-none opacity-55" : ""}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-[1.5px] text-white/55">Bet Amount</span>
              <span className="font-bp-mono text-[12px] font-semibold text-white/35">PKR</span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={customAmount}
                onChange={(e) => handleCustom(e.target.value)}
                disabled={playing}
                min={MIN_BET}
                max={MAX_BET}
                className="flex-1 rounded-xl border border-white/[0.06] bg-black/30 py-3 px-3 font-bp-mono text-[16px] font-bold text-white outline-none focus:border-bp-accent/40 disabled:opacity-60"
              />
              <button onClick={half} disabled={playing} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 font-bp-mono text-[16px] font-bold text-white/85 hover:bg-black/40 disabled:opacity-60">½</button>
              <button onClick={double} disabled={playing} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 font-bp-mono text-[16px] font-bold text-white/85 hover:bg-black/40 disabled:opacity-60">2×</button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  disabled={playing}
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

          <button
            onClick={play}
            disabled={playing || k === 0}
            className="rounded-2xl border-0 bg-gradient-to-b from-bp-accent to-[#c97e08] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-[#1b1305] shadow-[0_4px_18px_rgba(242,154,11,0.45)] transition-all hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-none disabled:bg-white/[0.05] disabled:text-white/35 disabled:shadow-none"
          >
            {playing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1b1305]/30 border-t-[#1b1305]" />
                Drawing…
              </span>
            ) : (
              <>Play <span className="font-bp-mono opacity-90">PKR {fmtPKR(amount)}</span></>
            )}
          </button>
        </div>
        <style>{`
          @keyframes kn-draw { 0% { transform: scale(.6); opacity: .3 } 100% { transform: scale(1); opacity: 1 } }
          @keyframes kn-hit { 0% { transform: scale(.6) } 55% { transform: scale(1.18) } 100% { transform: scale(1) } }
          @keyframes kn-stamp { from { transform: rotate(-5deg) scale(1.6); opacity: 0 } to { transform: rotate(-5deg) scale(1); opacity: 1 } }
        `}</style>
      </GamesWrapper>
      <DepositSheet includePaddingBottom={false} open={depositOpen} onClose={async () => { setDepositOpen(false); await refreshBalance(); }} />
    </>
  );
}

export default KenoGame;
