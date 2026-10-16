"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GamesWrapper from "@/components/games/games-wrapper";
import { DepositSheet } from "@/components/deposit-sheet";
import { playClick } from "@/lib/sound";
import { getSoundSettings, onSoundSettingsChange } from "@/lib/sound-settings";
import { hapticTap, hapticWin, hapticLoss } from "@/lib/haptics";
import { fireWinConfetti } from "@/lib/confetti";
import {
  TOWER_ROWS, TOWER_DIFFICULTIES, TOWER_DIFFICULTY_ORDER, type TowerDifficulty,
  towerMultiplier,
} from "@/lib/games/dragon-tower";
import { TowerScene, type TowerFx, type TowerFxKind } from "./tower-scene";

const MIN_BET = 10;
const MAX_BET = 20000;
const PRESETS = [100, 500, 1000, 5000] as const;
const RECENT_MAX = 12;

type Phase = "idle" | "playing" | "lost" | "cashed";
type RecentKind = "cashout" | "loss";

interface RecentRound { mult: number; kind: RecentKind; }

type RevealResponse =
  | { result: "safe"; row: number; rowsCleared: number; multiplier: number; error?: string }
  | { result: "won"; row: number; rowsCleared: number; multiplier: number; payout: number; newBalance: number; layout: number[][]; error?: string }
  | { result: "dragon"; row: number; tileIndex: number; layout: number[][]; newBalance: number; error?: string }
  | { error: string };

function fmtPKR(n: number) {
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCompact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : n.toFixed(0);
}

/* ── Glyphs ─────────────────────────────────────────────────────────────── */
function EggGlyph() {
  return (
    <svg viewBox="0 0 32 40" className="h-[74%] w-[74%]" aria-hidden>
      <defs>
        <radialGradient id="dt-egg" cx="35%" cy="26%" r="82%">
          <stop offset="0%" stopColor="#f0fdfa" />
          <stop offset="38%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#047857" />
        </radialGradient>
        <radialGradient id="dt-egg-aura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(52,211,153,0.5)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0)" />
        </radialGradient>
      </defs>
      {/* Aura */}
      <ellipse cx="16" cy="21" rx="16" ry="19" fill="url(#dt-egg-aura)" />
      {/* Ground shadow */}
      <ellipse cx="16" cy="37.6" rx="9" ry="2" fill="rgba(0,0,0,0.4)" />
      <ellipse cx="16" cy="21" rx="12.5" ry="16.5" fill="url(#dt-egg)"
        style={{ filter: "drop-shadow(0 0 4px rgba(110,231,183,.9)) drop-shadow(0 0 12px rgba(52,211,153,.7))" }} />
      {/* Speckles */}
      <circle cx="20.5" cy="17" r="1.3" fill="rgba(4,78,56,.6)" />
      <circle cx="13" cy="24" r="1.1" fill="rgba(4,78,56,.55)" />
      <circle cx="19" cy="28" r="1.4" fill="rgba(4,78,56,.5)" />
      <circle cx="11.5" cy="31" r="0.9" fill="rgba(4,78,56,.45)" />
      {/* Shine */}
      <ellipse cx="11" cy="12" rx="3.4" ry="5" fill="rgba(255,255,255,.75)" transform="rotate(-18 11 12)" />
      <ellipse cx="13.5" cy="9" rx="1.2" ry="1.8" fill="rgba(255,255,255,.9)" transform="rotate(-24 13.5 9)" />
    </svg>
  );
}
// A slit-pupil reptile eye — reads as "a dragon was here" far better than a flame blob.
function DragonGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-[74%] w-[74%]" aria-hidden>
      <defs>
        <radialGradient id="dt-iris" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="38%" stopColor="#fb923c" />
          <stop offset="72%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </radialGradient>
        <radialGradient id="dt-eye-aura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(249,115,22,0.45)" />
          <stop offset="100%" stopColor="rgba(249,115,22,0)" />
        </radialGradient>
      </defs>
      {/* Aura */}
      <circle cx="16" cy="16" r="15.5" fill="url(#dt-eye-aura)" />
      {/* Almond socket */}
      <path d="M2.5 16 Q 16 3.5 29.5 16 Q 16 28.5 2.5 16 Z" fill="#1c0505" stroke="rgba(255,120,90,0.55)" strokeWidth="1.2" />
      {/* Iris */}
      <circle cx="16" cy="16" r="8.4" fill="url(#dt-iris)"
        style={{ filter: "drop-shadow(0 0 5px rgba(253,186,116,.95)) drop-shadow(0 0 14px rgba(249,115,22,.8))" }} />
      {/* Slit pupil */}
      <path d="M16 8.2 C 18 12, 18 20, 16 23.8 C 14 20, 14 12, 16 8.2 Z" fill="#0a0202" />
      {/* Glint */}
      <ellipse cx="12.6" cy="12.2" rx="1.7" ry="2.4" fill="rgba(255,255,255,.7)" />
      {/* Upper lid shadow */}
      <path d="M2.5 16 Q 16 3.5 29.5 16" fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="1.4" />
    </svg>
  );
}


export function DragonTowerGame({ initialBalance = 12500 }: { initialBalance?: number }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [balance, setBalance] = useState(initialBalance);
  const [amount, setAmount] = useState(500);
  const [customAmount, setCustomAmount] = useState("500");
  const [difficulty, setDifficulty] = useState<TowerDifficulty>("easy");

  const [phase, setPhase] = useState<Phase>("idle");
  const [rowsCleared, setRowsCleared] = useState(0);
  const [picks, setPicks] = useState<number[]>([]); // picks[row] = chosen tile
  const [revealedLayout, setRevealedLayout] = useState<number[][] | null>(null);
  const [hitTile, setHitTile] = useState<{ row: number; tile: number } | null>(null);
  const [seedStr, setSeedStr] = useState<string>("");
  const [starting, setStarting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentRound[]>([
    { mult: 1.32, kind: "cashout" }, { mult: 0, kind: "loss" }, { mult: 3.49, kind: "cashout" },
    { mult: 0, kind: "loss" }, { mult: 1.98, kind: "cashout" },
  ]);

  const roundIdRef = useRef<string | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const loseAudioRef = useRef<HTMLAudioElement | null>(null);

  // One-shot FX events for the Three.js scene (spark bursts at the acted row).
  const [fx, setFx] = useState<TowerFx>(null);
  const fxSeqRef = useRef(0);
  const pushFx = useCallback((kind: TowerFxKind, row: number) => {
    setFx({ kind, row, seq: ++fxSeqRef.current });
  }, []);

  const cfg = TOWER_DIFFICULTIES[difficulty];
  const inPlay = phase === "playing";
  const settled = phase === "lost" || phase === "cashed";
  const currentMult = towerMultiplier(difficulty, rowsCleared);
  const nextMult = towerMultiplier(difficulty, rowsCleared + 1);
  const potential = amount * currentMult;
  const profit = potential - amount;

  /* ── Audio ───────────────────────────────────────────────────────────── */
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

  /* ── Round lifecycle ─────────────────────────────────────────────────── */
  const startRound = useCallback(async () => {
    if (phase === "playing" || starting) return;
    if (amount < MIN_BET) { setError("Minimum bet is PKR 10."); return; }
    if (amount > MAX_BET) { setError("Max bet is PKR 20,000."); return; }
    if (amount > balance) { setDepositOpen(true); return; }

    setStarting(true);
    setError(null);
    playClick();
    try {
      const res = await fetch("/api/games/dragon-tower", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, difficulty }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to start round"); return; }
      roundIdRef.current = data.roundId;
      setBalance(data.newBalance);
      setSeedStr(data.seedHash ?? "");
      setRowsCleared(0);
      setPicks([]);
      setRevealedLayout(null);
      setHitTile(null);
      setStatusMsg(null);
      setPhase("playing");
      hapticTap();
    } catch {
      setError("Network error — try again");
    } finally {
      setStarting(false);
    }
  }, [phase, starting, amount, balance, difficulty]);

  const pickTile = useCallback(async (row: number, tile: number) => {
    if (phase !== "playing" || revealing || row !== rowsCleared) return;
    const roundId = roundIdRef.current;
    if (!roundId) return;

    setRevealing(true);
    playClick();
    hapticTap();
    try {
      const res = await fetch("/api/games/dragon-tower/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, row, tileIndex: tile }),
      });
      const data: RevealResponse = await res.json();
      if (!res.ok || !("result" in data)) {
        setError(("error" in data && data.error) ? data.error : "Reveal failed");
        return;
      }

      if (data.result === "safe") {
        setPicks((p) => { const n = [...p]; n[row] = tile; return n; });
        setRowsCleared(data.rowsCleared);
        pushFx("pick", row);
      } else if (data.result === "won") {
        roundIdRef.current = null;
        setPicks((p) => { const n = [...p]; n[row] = tile; return n; });
        setRowsCleared(data.rowsCleared);
        setRevealedLayout(data.layout);
        setBalance(data.newBalance);
        setStatusMsg(`Top reached @ ${data.multiplier.toFixed(2)}×`);
        setRecents((r) => [{ mult: data.multiplier, kind: "cashout" as RecentKind }, ...r].slice(0, RECENT_MAX));
        setPhase("cashed");
        hapticWin();
        playAudio(winAudioRef);
        fireWinConfetti();
        pushFx("win", row);
      } else {
        roundIdRef.current = null;
        setHitTile({ row: data.row, tile: data.tileIndex });
        setRevealedLayout(data.layout);
        setStatusMsg(`Dragon on row ${data.row + 1}`);
        setRecents((r) => [{ mult: 0, kind: "loss" as RecentKind }, ...r].slice(0, RECENT_MAX));
        setPhase("lost");
        hapticLoss();
        playAudio(loseAudioRef);
        pushFx("lose", data.row);
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setRevealing(false);
    }
  }, [phase, revealing, rowsCleared, pushFx]);

  const cashout = useCallback(async () => {
    if (phase !== "playing" || rowsCleared < 1 || revealing) return;
    const roundId = roundIdRef.current;
    if (!roundId) return;
    roundIdRef.current = null;

    const mult = towerMultiplier(difficulty, rowsCleared);
    const win = amount * mult;
    // Optimistic — server reconciles the exact balance below.
    setBalance((b) => b + win);
    setStatusMsg(`Cashed out @ ${mult.toFixed(2)}×`);
    setRecents((r) => [{ mult, kind: "cashout" as RecentKind }, ...r].slice(0, RECENT_MAX));
    setPhase("cashed");
    hapticWin();
    playAudio(winAudioRef);
    fireWinConfetti();
    pushFx("win", Math.max(0, rowsCleared - 1));

    try {
      const res = await fetch("/api/games/dragon-tower/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, outcome: "cashed" }),
      });
      const data = await res.json();
      if (res.ok && typeof data.newBalance === "number") setBalance(data.newBalance);
    } catch { /* balance already updated optimistically */ }
  }, [phase, rowsCleared, revealing, difficulty, amount, pushFx]);

  const newRound = useCallback(() => {
    playClick();
    setPhase("idle");
    setRowsCleared(0);
    setPicks([]);
    setRevealedLayout(null);
    setHitTile(null);
    setStatusMsg(null);
    setError(null);
  }, []);

  /* ── Bet controls ────────────────────────────────────────────────────── */
  const setBet = (v: number) => {
    const n = Math.min(MAX_BET, Math.max(MIN_BET, Math.round(v)));
    setAmount(n); setCustomAmount(String(n));
  };
  const onCustomChange = (v: string) => {
    setCustomAmount(v);
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) setAmount(Math.min(MAX_BET, Math.max(MIN_BET, n)));
  };

  /* ── Tile state ──────────────────────────────────────────────────────── */
  type TileVisual = "egg" | "egg-picked" | "dragon" | "dragon-hit" | "hidden-active" | "cleared-other" | "upcoming";
  const tileVisual = (row: number, tile: number): TileVisual => {
    if (revealedLayout) {
      const isEgg = revealedLayout[row]?.includes(tile) ?? false;
      if (hitTile && hitTile.row === row && hitTile.tile === tile) return "dragon-hit";
      if (picks[row] === tile) return "egg-picked";
      return isEgg ? "egg" : "dragon";
    }
    if (row < rowsCleared) return picks[row] === tile ? "egg-picked" : "cleared-other";
    if (row === rowsCleared && inPlay) return "hidden-active";
    return "upcoming";
  };

  /* ── Main button ─────────────────────────────────────────────────────── */
  const mainBtn = (() => {
    if (phase === "playing") {
      if (rowsCleared === 0) {
        return (
          <button disabled className="flex-1 rounded-2xl border border-dashed border-white/15 bg-transparent py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-white/40">
            Pick a tile to climb
          </button>
        );
      }
      return (
        <button
          onClick={cashout}
          disabled={revealing}
          className="flex-1 rounded-2xl bg-gradient-to-b from-bp-win to-[#1eb39b] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-[#062e26] shadow-[0_4px_22px_rgba(94,234,212,0.4)] transition-all hover:opacity-95 active:scale-[.99] disabled:opacity-60"
        >
          Cash Out <span className="font-bp-mono text-[15px] opacity-90">PKR {fmtPKR(potential)}</span>
        </button>
      );
    }
    if (settled) {
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
        disabled={starting}
        className="flex-1 rounded-2xl bg-gradient-to-b from-bp-accent to-[#c97e08] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-[#1b1305] shadow-[0_4px_18px_rgba(242,154,11,0.45)] transition-all hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-none disabled:bg-white/[0.05] disabled:text-white/35 disabled:shadow-none"
      >
        {starting ? "Starting…" : "Bet"}{" "}
        {!starting && <span className="font-bp-mono opacity-90">PKR {fmtPKR(amount)}</span>}
      </button>
    );
  })();

  // Rows rendered top (highest) → bottom (row 0) so the climb goes upward.
  const rowOrder = useMemo(
    () => Array.from({ length: TOWER_ROWS }, (_, i) => TOWER_ROWS - 1 - i),
    [],
  );

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <>
      {/* Component-scoped keyframes for tile reveal / feedback choreography */}
      <style>{`
        @keyframes dt-flip { from { transform: rotateX(88deg); opacity: .25 } to { transform: rotateX(0); opacity: 1 } }
        @keyframes dt-shake { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-3px) } 40% { transform: translateX(3px) } 60% { transform: translateX(-2px) } 80% { transform: translateX(2px) } }
        @keyframes dt-stamp { from { transform: rotate(-5deg) scale(1.7); opacity: 0 } to { transform: rotate(-5deg) scale(1); opacity: 1 } }
        @keyframes dt-rune { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
        @keyframes dt-egg-pop { from { transform: scale(.55) } 60% { transform: scale(1.12) } to { transform: scale(1) } }
        @keyframes dt-sheen { from { transform: translateX(-160%) skewX(-14deg) } to { transform: translateX(420%) skewX(-14deg) } }
      `}</style>
      <GamesWrapper
        balance={balance}
        name="Dragon Tower"
        subtitle="Climb · Dodge the Dragons"
        gameType="dragon-tower"
        isPlaying={inPlay}
        onDepositClose={refreshBalance}
      >
        {/* ── Stage ── */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_90%_55%_at_50%_-5%,rgba(249,115,22,0.14)_0%,transparent_60%),radial-gradient(ellipse_65%_45%_at_50%_105%,rgba(190,24,93,0.18)_0%,transparent_65%),linear-gradient(180deg,#150818_0%,#0b0510_55%,#0e060f_100%)]">
          {/* 3D ember atmosphere (parallax + event bursts) + edge vignette */}
          <TowerScene phase={phase} fx={fx} />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_130%_100%_at_50%_50%,transparent_55%,rgba(0,0,0,0.45)_100%)]" />
          {phase === "lost" && (
            <div className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_at_50%_60%,rgba(255,93,115,0.10),transparent_70%)]" />
          )}

          {/* Recent + multiplier readout */}
          <div className="z-10 flex items-center justify-between gap-2 px-3 pt-3">
            <div className="flex max-w-[82%] items-center gap-1.5 overflow-hidden rounded-full border border-white/[0.06] bg-black/45 px-2.5 py-1.5 backdrop-blur">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bp-win shadow-[0_0_10px_rgba(94,234,212,.8)]" />
              <span className="mr-1 shrink-0 text-[9px] font-black uppercase tracking-[2px] text-white/45">Recent</span>
              <div className="flex gap-1.5 overflow-hidden">
                {recents.map((r, i) => (
                  <div key={i} className={`shrink-0 rounded-full border px-2.5 py-1 font-bp-mono text-[11px] font-black ${r.kind === "loss" ? "border-bp-lose/50 bg-bp-lose/15 text-bp-lose" : "border-bp-win/50 bg-bp-win/15 text-bp-win"}`}>
                    {r.kind === "loss" ? "0.00" : r.mult.toFixed(2)}×
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="z-[1] flex flex-col items-center px-3 pt-2 pb-1 pointer-events-none">
            <div className="text-[9px] font-black uppercase tracking-[4px] text-white/35">
              {inPlay ? "Current Multiplier" : phase === "cashed" ? "Cashed Out" : phase === "lost" ? "Burned!" : "Multiplier"}
            </div>
            <div className={`font-bp-mono text-[40px] sm:text-[52px] font-black leading-none tracking-[-.06em] ${phase === "lost" ? "text-bp-lose drop-shadow-[0_0_22px_rgba(255,93,115,.35)]" : currentMult > 1 ? "text-bp-accent drop-shadow-[0_0_22px_rgba(242,154,11,.4)]" : "text-white/80"}`}>
              {currentMult.toFixed(2)}<span className="text-[.55em] opacity-70">×</span>
            </div>
            <div className="mt-0.5 min-h-4 text-center text-[11px] sm:text-[12px] font-bold uppercase tracking-[2px] text-white/45">
              {statusMsg || (inPlay ? `Next: ${nextMult.toFixed(2)}×` : "Pick difficulty & bet, then press Bet")}
            </div>
          </div>

          {/* Tower */}
          <div className="relative grid min-h-0 flex-1 place-items-center px-2 pb-1">
            <div className="flex h-full w-full max-w-[420px] flex-col gap-1.5 py-1">
              {rowOrder.map((row) => {
                const isActive = inPlay && row === rowsCleared;
                const isCleared = row < rowsCleared;
                const rowMult = towerMultiplier(difficulty, row + 1);
                return (
                  <div key={row} className={`flex min-h-0 flex-1 items-stretch gap-1.5 rounded-xl transition-opacity ${!isActive && inPlay && row > rowsCleared ? "opacity-40" : "opacity-100"} ${isActive ? "bg-gradient-to-r from-bp-accent/[0.06] via-transparent to-bp-accent/[0.06]" : ""}`}>
                    <div className={`flex w-[52px] shrink-0 items-center justify-end pr-1 font-bp-mono text-[11px] font-black tabular-nums transition-colors ${isActive ? "text-bp-accent drop-shadow-[0_0_8px_rgba(242,154,11,0.6)]" : isCleared ? "text-bp-win/60" : "text-white/25"}`}>
                      {rowMult.toFixed(2)}×
                    </div>
                    <div className="flex flex-1 gap-1.5 [perspective:600px]">
                      {Array.from({ length: cfg.tiles }).map((_, tile) => {
                        const v = tileVisual(row, tile);
                        const clickable = isActive && !revealing;
                        // Reveal choreography: hit dragon flips instantly then shakes;
                        // the rest of the board flips staggered bottom-up; a freshly
                        // picked egg pops during the climb.
                        const anim =
                          v === "dragon-hit"
                            ? "dt-flip .45s ease backwards, dt-shake .5s ease .45s"
                            : revealedLayout && (v === "egg" || v === "dragon" || v === "egg-picked")
                              ? `dt-flip .45s ease ${row * 45}ms backwards`
                              : !revealedLayout && v === "egg-picked"
                                ? "dt-egg-pop .32s cubic-bezier(.2,1.5,.4,1)"
                                : undefined;
                        return (
                          <button
                            key={tile}
                            onClick={() => pickTile(row, tile)}
                            disabled={!clickable}
                            className={`group relative flex flex-1 items-center justify-center overflow-hidden rounded-[10px] border transition-all duration-150
                              ${v === "hidden-active" ? "border-bp-accent/35 bg-[linear-gradient(168deg,#31192f_0%,#1e0f22_55%,#150a1a_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_2px_10px_rgba(0,0,0,0.45)] hover:border-bp-accent/80 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_20px_rgba(242,154,11,0.28)] active:scale-[.96]" : ""}
                              ${v === "upcoming" ? "border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.015)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" : ""}
                              ${v === "cleared-other" ? "border-white/[0.04] bg-white/[0.015] opacity-40" : ""}
                              ${v === "egg" ? "border-bp-win/30 bg-bp-win/[0.08]" : ""}
                              ${v === "egg-picked" ? "border-bp-win/70 bg-bp-win/[0.16] shadow-[0_0_22px_rgba(94,234,212,0.3),inset_0_0_16px_rgba(94,234,212,0.15)]" : ""}
                              ${v === "dragon" ? "border-bp-lose/30 bg-bp-lose/[0.08]" : ""}
                              ${v === "dragon-hit" ? "border-bp-lose/70 bg-bp-lose/[0.17] shadow-[0_0_26px_rgba(255,93,115,0.45),inset_0_0_16px_rgba(255,93,115,0.2)]" : ""}
                            `}
                            style={{ cursor: clickable ? "pointer" : "default", animation: anim }}
                          >
                            {v === "hidden-active" && (
                              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" style={{ animation: "dt-sheen 2.6s linear infinite" }} />
                            )}
                            {/* Glyphs sit out of layout flow so their aspect ratio can never
                                inflate row min-height and overflow the 9-row board. */}
                            {(v === "egg" || v === "egg-picked") && (
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center"><EggGlyph /></span>
                            )}
                            {(v === "dragon" || v === "dragon-hit") && (
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center"><DragonGlyph /></span>
                            )}
                            {v === "hidden-active" && (
                              <span className="font-bp-mono text-[17px] font-black text-bp-accent/45 transition-colors group-hover:text-bp-accent group-hover:drop-shadow-[0_0_10px_rgba(242,154,11,0.9)]" style={{ animation: "dt-rune 2.2s ease-in-out infinite" }}>?</span>
                            )}
                            {v === "upcoming" && <span className="select-none text-[9px] text-white/[0.09]">◆</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {starting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/30 backdrop-blur-[2px]">
                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-3 w-3 rounded-full bg-bp-accent animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Building Tower</p>
              </div>
            )}

            {/* Result stamp */}
            {settled && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                <div
                  className={`rounded-2xl border-2 px-7 py-3 text-center backdrop-blur-[3px] ${phase === "cashed"
                    ? "border-bp-win/70 bg-[#062e26]/60 shadow-[0_0_48px_rgba(94,234,212,0.35)]"
                    : "border-bp-lose/70 bg-[#2e0610]/60 shadow-[0_0_48px_rgba(255,93,115,0.35)]"}`}
                  style={{ animation: "dt-stamp .4s cubic-bezier(.2,1.6,.4,1) backwards", transform: "rotate(-5deg)" }}
                >
                  <div className={`text-[10px] font-black uppercase tracking-[4px] ${phase === "cashed" ? "text-bp-win/80" : "text-bp-lose/80"}`}>
                    {phase === "cashed" ? "Cashed Out" : "Dragon!"}
                  </div>
                  <div className={`font-bp-mono text-[26px] font-black uppercase leading-tight tracking-[2px] ${phase === "cashed" ? "text-bp-win" : "text-bp-lose"}`}>
                    {phase === "cashed" ? `${currentMult.toFixed(2)}×` : "Burned"}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom badges */}
          <div className="z-10 flex items-center justify-between gap-2 px-3 pb-2.5">
            <div className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-black/55 px-2.5 py-1 font-bp-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/45 backdrop-blur">
              {seedStr ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-bp-win shadow-[0_0_8px_rgba(94,234,212,.8)]" />
                  Fair · #{seedStr.slice(0, 8).toUpperCase()}
                </>
              ) : (
                <>{TOWER_DIFFICULTIES[difficulty].label} · {cfg.safe}/{cfg.tiles} safe</>
              )}
            </div>
            <div className="rounded-full border border-white/[0.06] bg-black/55 px-2.5 py-1 font-bp-mono text-[10px] font-bold text-white/55 backdrop-blur tabular-nums">
              Row {Math.min(rowsCleared + (inPlay ? 1 : 0), TOWER_ROWS)}/{TOWER_ROWS}
            </div>
          </div>
        </div>

        {/* ── Controls ── */}
        <div
          className="flex w-full flex-shrink-0 flex-col gap-2.5 border-t border-white/[0.06] bg-gradient-to-b from-[rgba(8,10,20,0.82)] to-[rgba(10,8,18,1)] px-3 pt-3 lg:w-[380px] lg:border-l lg:border-t-0 lg:gap-3 lg:overflow-y-auto lg:py-3"
          style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
        >
          {/* Difficulty */}
          <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 ${inPlay ? "pointer-events-none opacity-55" : ""}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-[1.5px] text-white/55">Difficulty</span>
              <span className="font-bp-mono text-[12px] font-black text-bp-accent">{TOWER_DIFFICULTIES[difficulty].label}</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {TOWER_DIFFICULTY_ORDER.map((d) => (
                <button
                  key={d}
                  onClick={() => { playClick(); setDifficulty(d); }}
                  className={`rounded-xl border py-2 font-bp-ui text-[12px] font-black uppercase tracking-wide transition-colors ${difficulty === d ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent" : "border-white/[0.06] bg-black/25 text-white/65 hover:bg-black/40"}`}
                >
                  {TOWER_DIFFICULTIES[d].label.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Bet amount */}
          <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 ${inPlay ? "pointer-events-none opacity-55" : ""}`}>
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
              <button onClick={() => { playClick(); setBet(amount / 2); }} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 font-bp-mono text-[16px] font-bold text-white/85 hover:bg-black/40">½</button>
              <button onClick={() => { playClick(); setBet(amount * 2); }} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 font-bp-mono text-[16px] font-bold text-white/85 hover:bg-black/40">2×</button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => { playClick(); setBet(p); }}
                  className={`rounded-lg border py-2 font-bp-mono text-[16px] font-bold transition-colors ${amount === p ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent" : "border-white/[0.06] bg-black/25 text-white/70 hover:bg-black/40"}`}
                >
                  {p >= 1000 ? `${p / 1000}k` : p}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/25 px-2 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Row</div>
              <div className="font-bp-mono text-[17px] font-black text-white tabular-nums">{rowsCleared}/{TOWER_ROWS}</div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/25 px-2 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Next</div>
              <div className="font-bp-mono text-[17px] font-black text-bp-accent">{nextMult.toFixed(2)}×</div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/25 px-2 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Profit</div>
              <div className={`font-bp-mono text-[17px] font-black ${profit > 0 ? "text-bp-win" : "text-white/80"}`}>+{fmtCompact(Math.max(0, profit))}</div>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-bp-lose/30 bg-bp-lose/10 px-4 py-2.5 text-center text-sm text-bp-lose">{error}</div>
          )}

          <div className="flex gap-2.5">{mainBtn}</div>
        </div>
      </GamesWrapper>
      <DepositSheet includePaddingBottom={false} open={depositOpen} onClose={async () => { setDepositOpen(false); await refreshBalance(); }} />
    </>
  );
}

export default DragonTowerGame;
