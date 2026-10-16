"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import GamesWrapper from "@/components/games/games-wrapper";
import { DepositSheet } from "@/components/deposit-sheet";
import { playClick } from "@/lib/sound";
import { getSoundSettings, onSoundSettingsChange } from "@/lib/sound-settings";
import { hapticTap, hapticWin, hapticLoss } from "@/lib/haptics";
import { fireWinConfetti } from "@/lib/confetti";
import { type Card, SUITS, RANK_LABEL, PlayingCard } from "@/components/games/_shared/playing-card";
import { ABScene, type AbFx, type AbFxKind } from "./ab-scene";

const PRESETS = [100, 500, 1000, 5000] as const;
const MIN_BET = 10;
const MAX_BET = 20000;
const MULTIPLIER = 1.96;
const RECENT_MAX = 12;

type Side = "andar" | "bahar";
type Phase = "idle" | "dealing" | "won" | "lost";

interface BetResponse {
  outcome: { joker: Card; andar: Card[]; bahar: Card[]; matchSide: Side; side: Side };
  won: boolean;
  newBalance: number;
  error?: string;
}

interface RecentRound { side: Side; won: boolean; }

function fmtPKR(n: number) {
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MiniCard({ card, highlight = false }: { card: Card; highlight?: boolean }) {
  const suit = SUITS[card.suit];
  return (
    <div
      className={`relative -ml-3 flex h-[58px] w-[42px] shrink-0 flex-col items-center justify-center rounded-md bg-gradient-to-b from-white to-[#f2ece2] font-bp-mono leading-none first:ml-0 ${highlight ? "z-10 ring-2 ring-bp-accent shadow-[0_0_16px_rgba(242,154,11,.75)]" : "shadow-[0_2px_8px_rgba(0,0,0,.5)]"}`}
      style={{ color: suit.color, animation: "ab-deal .26s ease-out" }}
    >
      <div className="text-[15px] font-black">{RANK_LABEL[card.rank]}</div>
      <div className="text-[13px]">{suit.glyph}</div>
    </div>
  );
}

function GlassPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex-shrink-0 rounded-3xl border border-white/[0.06] bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${className}`}>
      {children}
    </div>
  );
}

export function AndarBaharGame({ initialBalance = 12500 }: { initialBalance?: number }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [balance, setBalance] = useState(initialBalance);
  const [side, setSide] = useState<Side>("andar");
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState("100");

  const [phase, setPhase] = useState<Phase>("idle");
  const [joker, setJoker] = useState<Card | null>(null);
  const [shownAndar, setShownAndar] = useState<Card[]>([]);
  const [shownBahar, setShownBahar] = useState<Card[]>([]);
  const [matchSide, setMatchSide] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentRound[]>([]);

  const dealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const loseAudioRef = useRef<HTMLAudioElement | null>(null);

  // One-shot FX events for the Three.js table scene.
  const [fx, setFx] = useState<AbFx>(null);
  const fxSeqRef = useRef(0);
  const pushFx = useCallback((kind: AbFxKind) => {
    setFx({ kind, seq: ++fxSeqRef.current });
  }, []);

  const dealing = phase === "dealing";
  const settled = phase === "won" || phase === "lost";
  const profitOnWin = parseFloat((amount * MULTIPLIER - amount).toFixed(2));

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
  // Clear any pending deal timer on unmount
  useEffect(() => () => { if (dealTimerRef.current) clearTimeout(dealTimerRef.current); }, []);

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

  const finishDeal = useCallback((didWin: boolean, newBalance: number, side2: Side) => {
    setMatchSide(side2);
    setBalance(newBalance);
    setPhase(didWin ? "won" : "lost");
    setRecents((r) => [{ side: side2, won: didWin }, ...r].slice(0, RECENT_MAX));
    if (didWin) { hapticWin(); playAudio(winAudioRef); fireWinConfetti(); }
    else { hapticLoss(); playAudio(loseAudioRef); }
    pushFx(didWin ? "win" : "lose");
  }, [pushFx]);

  // Reveal the dealt cards alternately (Andar first), then settle on the last card.
  const runDeal = useCallback((andar: Card[], bahar: Card[], ms: Side, didWin: boolean, newBalance: number) => {
    const order: { side: Side; idx: number }[] = [];
    const maxLen = Math.max(andar.length, bahar.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < andar.length) order.push({ side: "andar", idx: i });
      if (i < bahar.length) order.push({ side: "bahar", idx: i });
    }
    let i = 0;
    const step = () => {
      const o = order[i];
      if (o.side === "andar") setShownAndar((p) => [...p, andar[o.idx]]);
      else setShownBahar((p) => [...p, bahar[o.idx]]);
      playClick();
      pushFx("deal");
      i++;
      if (i >= order.length) {
        dealTimerRef.current = setTimeout(() => finishDeal(didWin, newBalance, ms), 420);
        return;
      }
      dealTimerRef.current = setTimeout(step, 260);
    };
    step();
  }, [finishDeal, pushFx]);

  const deal = useCallback(async () => {
    if (dealing) return;
    playClick();
    if (amount > MAX_BET) { setError("Max bet is PKR 20,000."); return; }
    if (amount < MIN_BET || amount > balance) { setDepositOpen(true); return; }

    hapticTap();
    setError(null);
    setJoker(null);
    setShownAndar([]);
    setShownBahar([]);
    setMatchSide(null);
    setPhase("dealing");

    try {
      const res = await fetch("/api/games/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType: "andar-bahar", amount, choice: { side } }),
      });
      const data: BetResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bet failed");

      const { joker: jk, andar, bahar, matchSide: ms } = data.outcome;
      setJoker(jk);
      // Brief beat to register the joker, then deal.
      dealTimerRef.current = setTimeout(() => runDeal(andar, bahar, ms, data.won, data.newBalance), 520);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error placing bet");
      setPhase("idle");
    }
  }, [dealing, amount, balance, side, runDeal]);

  const newRound = useCallback(() => {
    playClick();
    setPhase("idle");
    setJoker(null);
    setShownAndar([]);
    setShownBahar([]);
    setMatchSide(null);
    setError(null);
  }, []);

  const setPreset = (v: number) => { playClick(); setAmount(v); setCustomAmount(String(v)); };
  const handleCustom = (v: string) => {
    setCustomAmount(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > 0) setAmount(n);
  };
  const half = () => { playClick(); const n = Math.max(MIN_BET, parseFloat((amount / 2).toFixed(2))); setAmount(n); setCustomAmount(String(n)); };
  const double = () => { playClick(); const n = Math.min(MAX_BET, parseFloat((amount * 2).toFixed(2))); setAmount(n); setCustomAmount(String(n)); };

  const Lane = ({ laneSide, cards }: { laneSide: Side; cards: Card[] }) => {
    const picked = side === laneSide;
    const winnerLane = settled && matchSide === laneSide;
    const label = laneSide === "andar" ? "Andar" : "Bahar";
    return (
      <div
        className={`relative flex min-h-[78px] flex-1 items-center gap-2 rounded-2xl border px-3 py-2 transition-colors ${winnerLane
          ? "border-bp-win/60 bg-[linear-gradient(180deg,rgba(94,234,212,0.12),rgba(94,234,212,0.04))]"
          : picked
            ? "border-bp-accent/45 bg-[linear-gradient(180deg,rgba(242,154,11,0.09),rgba(242,154,11,0.03))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
            : "border-white/[0.06] bg-[linear-gradient(180deg,rgba(6,40,30,0.5),rgba(4,24,18,0.5))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"}`}
        style={winnerLane ? { animation: "ab-lane-pulse .7s ease-out forwards" } : undefined}
      >
        <div className="flex w-[58px] shrink-0 flex-col">
          <span className={`font-bp-ui text-[13px] font-black uppercase tracking-wider ${winnerLane ? "text-bp-win" : picked ? "text-bp-accent" : "text-white/55"}`}>{label}</span>
          {picked && <span className="text-[9px] uppercase tracking-[2px] text-white/35">your pick</span>}
        </div>
        <div className="flex flex-1 items-center overflow-x-auto pl-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {cards.length === 0 ? (
            <span className="-ml-3 text-[11px] text-white/20">—</span>
          ) : (
            cards.map((c, i) => (
              <MiniCard key={i} card={c} highlight={settled && matchSide === laneSide && i === cards.length - 1} />
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <GamesWrapper
        balance={balance}
        name="Andar Bahar"
        subtitle="Pick a Side · 1.96×"
        gameType="andar-bahar"
        isPlaying={dealing}
        onDepositClose={refreshBalance}
      >
        {/* ── Stage ── */}
        <div className="relative flex min-h-[260px] flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_75%_55%_at_50%_-5%,rgba(242,154,11,0.10)_0%,transparent_55%),radial-gradient(ellipse_80%_70%_at_50%_35%,rgba(16,185,129,0.14)_0%,transparent_65%),linear-gradient(180deg,#061711_0%,#07110d_100%)]">

          {/* 3D table scene: golden dust, floating suits, deal/win/lose bursts */}
          <ABScene phase={phase} fx={fx} />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_130%_100%_at_50%_50%,transparent_55%,rgba(0,0,0,0.5)_100%)]" />

          {/* Winner stamp */}
          {settled && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div
                className={`rounded-2xl border-2 px-7 py-3 text-center backdrop-blur-[3px] ${phase === "won"
                  ? "border-bp-win/70 bg-[#062e26]/60 shadow-[0_0_48px_rgba(94,234,212,0.35)]"
                  : "border-bp-lose/70 bg-[#2e0610]/60 shadow-[0_0_48px_rgba(255,93,115,0.35)]"}`}
                style={{ animation: "ab-stamp .4s cubic-bezier(.2,1.6,.4,1) backwards", transform: "rotate(-5deg)" }}
              >
                <div className={`text-[10px] font-black uppercase tracking-[4px] ${phase === "won" ? "text-bp-win/80" : "text-bp-lose/80"}`}>
                  {matchSide === "andar" ? "Andar" : "Bahar"} Matched
                </div>
                <div className={`font-bp-mono text-[24px] font-black leading-tight tracking-[1px] ${phase === "won" ? "text-bp-win" : "text-bp-lose"}`}>
                  {phase === "won" ? `+PKR ${fmtPKR(profitOnWin)}` : `−PKR ${fmtPKR(amount)}`}
                </div>
              </div>
            </div>
          )}

          {/* Recent strip */}
          <div className="z-10 flex items-center gap-2 px-3 pt-3">
            <div className="flex max-w-full items-center gap-1.5 overflow-hidden rounded-full border border-white/[0.06] bg-black/45 px-2.5 py-1.5 backdrop-blur">
              <span className="mr-1 shrink-0 text-[9px] font-black uppercase tracking-[2px] text-white/45">Recent</span>
              <div className="flex gap-1.5 overflow-hidden">
                {recents.length === 0 ? (
                  <span className="text-[10px] text-white/25">No rounds yet</span>
                ) : recents.map((r, i) => (
                  <div key={i} className={`shrink-0 rounded-full border px-2 py-0.5 font-bp-mono text-[10px] font-black uppercase ${r.won ? "border-bp-win/50 bg-bp-win/15 text-bp-win" : "border-bp-lose/50 bg-bp-lose/15 text-bp-lose"}`}>
                    {r.side === "andar" ? "A" : "B"}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Joker */}
          <div className="z-[1] flex flex-col items-center px-3 pt-3 pb-1">
            <div className="text-[9px] font-black uppercase tracking-[4px] text-white/35">Joker</div>
            <div className="relative mt-1.5 flex h-[80px] items-center justify-center [perspective:500px]">
              {/* Spotlight pool under the joker */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(242,154,11,0.18),transparent_65%)]" />
              {joker ? (
                <div style={{ animation: "ab-flip .5s ease-out" }}>
                  <PlayingCard card={joker} small glow />
                </div>
              ) : (
                <div className="flex h-[76px] w-[54px] items-center justify-center rounded-xl border-2 border-dashed border-white/15 text-white/20">
                  <span className="font-bp-mono text-2xl">?</span>
                </div>
              )}
            </div>
            <div className="mt-1 min-h-4 text-center text-[11px] font-bold uppercase tracking-[2px]">
              {phase === "won" ? (
                <span className="text-bp-win">You Won · +PKR {fmtPKR(profitOnWin)}</span>
              ) : phase === "lost" ? (
                <span className="text-bp-lose">{matchSide === "andar" ? "Andar" : "Bahar"} matched · −PKR {fmtPKR(amount)}</span>
              ) : dealing ? (
                <span className="text-white/45">Dealing…</span>
              ) : (
                <span className="text-white/35">Bet on {side}</span>
              )}
            </div>
          </div>

          {/* Lanes */}
          <div className="relative z-[1] flex min-h-0 flex-1 flex-col justify-center gap-2.5 px-3 pb-3">
            <Lane laneSide="andar" cards={shownAndar} />
            <Lane laneSide="bahar" cards={shownBahar} />
          </div>
        </div>

        {/* ── Controls ── */}
        <div
          className="flex w-full flex-shrink-0 flex-col gap-3 overflow-y-auto bg-gradient-to-b from-[rgba(8,10,20,0.82)] to-[rgba(10,8,18,1)] px-4 py-4 sm:px-6 lg:w-[420px] lg:flex-1 lg:overflow-y-auto"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {/* Side pick */}
          <GlassPanel>
            <div className="mb-3 text-[12px] uppercase tracking-[2px] text-white/45">Your Side</div>
            <div className="relative grid grid-cols-2 rounded-3xl border border-white/[0.04] bg-black/35 p-1.5">
              <div className={`absolute bottom-1.5 top-1.5 rounded-2xl bg-gradient-to-b from-bp-accent to-[#c97e08] shadow-[0_2px_16px_rgba(242,154,11,0.4)] transition-all duration-300 ${side === "andar" ? "left-1.5 right-[50%]" : "left-[50%] right-1.5"}`} />
              {(["andar", "bahar"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => { playClick(); setSide(s); }}
                  disabled={dealing}
                  className={`relative z-[1] min-h-[44px] rounded-2xl py-3 text-[17px] font-extrabold uppercase tracking-wider transition-colors disabled:cursor-not-allowed ${side === s ? "text-[#1b1305]" : "text-white/55"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </GlassPanel>

          {/* Bet amount */}
          <GlassPanel>
            <div className="mb-3 text-[12px] uppercase tracking-[2px] text-white/45">Bet Amount</div>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  disabled={dealing}
                  className={`min-h-[44px] rounded-2xl border py-2 font-bp-mono text-[17px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${amount === p ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent" : "border-white/[0.06] bg-black/25 text-white/75 hover:bg-black/40"}`}
                >
                  {p >= 1000 ? `${p / 1000}k` : p}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-white/40">PKR</span>
                <input
                  type="number"
                  value={customAmount}
                  onChange={(e) => handleCustom(e.target.value)}
                  disabled={dealing}
                  min={MIN_BET}
                  max={MAX_BET}
                  className="w-full rounded-2xl border border-white/[0.06] bg-black/30 py-3.5 pl-14 pr-3 font-bp-mono text-[17px] font-bold text-white outline-none focus:border-bp-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <button onClick={half} disabled={dealing} className="min-h-[44px] min-w-[64px] rounded-2xl border border-white/[0.06] bg-black/30 px-3 font-bp-mono text-[18px] font-bold text-white/85 hover:bg-black/40 disabled:cursor-not-allowed disabled:opacity-60">½</button>
              <button onClick={double} disabled={dealing} className="min-h-[44px] min-w-[64px] rounded-2xl border border-white/[0.06] bg-black/30 px-3 font-bp-mono text-[18px] font-bold text-white/85 hover:bg-black/40 disabled:cursor-not-allowed disabled:opacity-60">2×</button>
            </div>
          </GlassPanel>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-center">
              <div className="text-[11px] uppercase tracking-wider text-white/40">Win chance</div>
              <div className="mt-1 font-bp-mono text-[18px] font-bold text-white sm:text-[20px]">~50%</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-center">
              <div className="text-[11px] uppercase tracking-wider text-white/40">Multiplier</div>
              <div className="mt-1 font-bp-mono text-[18px] font-bold text-bp-accent sm:text-[20px]">{MULTIPLIER.toFixed(2)}×</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-center">
              <div className="text-[11px] uppercase tracking-wider text-white/40">Profit</div>
              <div className="mt-1 font-bp-mono text-[18px] font-bold text-white sm:text-[20px]">+{profitOnWin >= 1000 ? `${(profitOnWin / 1000).toFixed(1)}k` : profitOnWin.toFixed(0)}</div>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-bp-lose/30 bg-bp-lose/10 px-4 py-3 text-center text-sm text-bp-lose">{error}</div>
          )}

          {settled ? (
            <button
              onClick={newRound}
              className="rounded-3xl border border-white/[0.10] bg-white/[0.05] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-white/85 hover:bg-white/[0.08] active:scale-[0.99] sm:text-[17px]"
            >
              New Round
            </button>
          ) : (
            <button
              onClick={deal}
              disabled={dealing}
              className="rounded-3xl border-0 bg-gradient-to-b from-bp-accent to-[#c97e08] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-[#1b1305] shadow-[0_4px_18px_rgba(242,154,11,0.45)] transition-all hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:py-5 sm:text-[17px]"
            >
              {dealing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1b1305]/30 border-t-[#1b1305]" />
                  Dealing…
                </span>
              ) : "Deal"}
            </button>
          )}
        </div>

        <style>{`
          @keyframes ab-deal { 0% { opacity:0; transform: translateY(-14px) rotate(-6deg); } 100% { opacity:1; transform:none; } }
          @keyframes ab-flip { 0% { transform: rotateY(88deg) scale(.9); opacity:.3 } 100% { transform: none; opacity:1 } }
          @keyframes ab-stamp { from { transform: rotate(-5deg) scale(1.6); opacity: 0 } to { transform: rotate(-5deg) scale(1); opacity: 1 } }
          @keyframes ab-lane-pulse { 0% { box-shadow: 0 0 0 rgba(94,234,212,0) } 40% { box-shadow: 0 0 36px rgba(94,234,212,0.4) } 100% { box-shadow: 0 0 16px rgba(94,234,212,0.18) } }
        `}</style>
      </GamesWrapper>
      <DepositSheet includePaddingBottom={false} open={depositOpen} onClose={async () => { setDepositOpen(false); await refreshBalance(); }} />
    </>
  );
}

export default AndarBaharGame;
