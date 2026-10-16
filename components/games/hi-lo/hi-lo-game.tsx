"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playClick } from "@/lib/sound";
import { getSoundSettings, onSoundSettingsChange } from "@/lib/sound-settings";
import { hapticTap, hapticWin, hapticLoss } from "@/lib/haptics";
import { fireWinConfetti } from "@/lib/confetti";
import GamesWrapper from "@/components/games/games-wrapper";
import { DepositSheet } from "@/components/deposit-sheet";
import { type Card, SUITS, RANK_LABEL, PlayingCard } from "@/components/games/_shared/playing-card";

const PRESETS = [100, 500, 1000, 5000] as const;
const MIN_BET = 10;
const MAX_BET = 20000;
const HOUSE_EDGE = 0.01;
const MAX_HISTORY = 10;

type Phase = "idle" | "starting" | "playing" | "revealing" | "settled";
type Guess = "hi" | "lo";
type RecentKind = "cashout" | "loss" | "win";

type DrawHistory = { card: Card; win: boolean; mult: number; guess: Guess };
type RecentRound = { mult: number; kind: RecentKind };

// SUITS, RANK_LABEL, Card, CornerPip, PlayingCard imported from _shared/playing-card

function fmtPKR(n: number) {
    return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Used only for the idle visual card — game draws are server-controlled
function pickVisualCard(prev?: Card | null): Card {
    let next: Card;
    do {
        next = { rank: Math.floor(Math.random() * 13), suit: Math.floor(Math.random() * 4) };
    } while (prev && next.rank === prev.rank && Math.random() < 0.5);
    return next;
}

function probHigher(rank: number) { return Math.max(0, 12 - rank) / 13; }
function probLower(rank: number) { return Math.max(0, rank) / 13; }
function multFromProb(prob: number) { return prob <= 0 ? 0 : Math.max(1.01, (1 - HOUSE_EDGE) / prob); }

function CardBack({ className = "" }: { className?: string }) {
    return (
        <div
            className={`relative overflow-hidden rounded-[18px] border-4 border-bp-accent h-[238px] w-[170px] sm:h-[270px] sm:w-[194px] ${className}`}
            style={{
                background: "repeating-linear-gradient(45deg,#2a1d4e 0 7px,#1c1336 7px 14px)",
                boxShadow: "0 14px 34px rgba(0,0,0,.55), inset 0 0 0 1px rgba(0,0,0,.45)",
            }}
        >
            <div className="absolute inset-4 flex items-center justify-center rounded-xl border border-dashed border-bp-accent/45 font-bp-mono text-4xl font-black text-bp-accent/80">HL</div>
        </div>
    );
}

function RecentChip({ item }: { item: RecentRound }) {
    const cls = item.kind === "loss" ? "border-bp-lose/50 bg-bp-lose/15 text-bp-lose" : item.kind === "cashout" ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent" : "border-bp-win/50 bg-bp-win/15 text-bp-win";
    return <div className={`rounded-full border px-2.5 py-1 font-bp-mono text-[11px] font-black ${cls}`}>{item.kind === "loss" ? "0.00" : item.mult.toFixed(2)}×</div>;
}

function GlassPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <div className={`rounded-3xl border border-white/[0.06] bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${className}`}>{children}</div>;
}

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-black/25 px-2 py-2.5 text-center">
            <div className="text-[11px] uppercase tracking-wider text-white/40">{label}</div>
            <div className={`mt-1 font-bp-mono text-[17px] font-black ${accent ? "text-bp-accent" : "text-white"}`}>{value}</div>
        </div>
    );
}

function GuessButton({ guess, rank, multiplier, disabled, onClick }: { guess: Guess; rank: number; multiplier: number; disabled: boolean; onClick: () => void }) {
    const isHi = guess === "hi";
    const prob = isHi ? probHigher(rank) : probLower(rank);
    const mult = multiplier * multFromProb(prob);
    return (
        <button
            onClick={onClick}
            disabled={disabled || prob <= 0}
            className={`flex items-center justify-between rounded-2xl border p-2.5 text-left transition-all active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-40 ${isHi ? "border-[#2dd4bf]/30 bg-[#2dd4bf]/10 hover:bg-[#2dd4bf]/15" : "border-[#f472b6]/30 bg-[#f472b6]/10 hover:bg-[#f472b6]/15"}`}
        >
            <div className="flex items-center gap-2.5">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg font-black text-[#080710] ${isHi ? "bg-[#2dd4bf]" : "bg-[#f472b6]"}`}>{isHi ? "↑" : "↓"}</div>
                <div>
                    <div className="text-[13px] font-black uppercase tracking-wider text-white">{isHi ? "Higher" : "Lower"}</div>
                    <div className="mt-0.5 text-[10px] text-white/45">Next {isHi ? ">" : "<"} {RANK_LABEL[rank]}</div>
                </div>
            </div>
            <div className="text-right">
                <div className={`font-bp-mono text-[17px] font-black ${isHi ? "text-[#2dd4bf]" : "text-[#f472b6]"}`}>{mult.toFixed(2)}×</div>
                <div className="font-bp-mono text-[10px] text-white/40">{(prob * 100).toFixed(1)}%</div>
            </div>
        </button>
    );
}

export function HiLoGame({ initialBalance }: { initialBalance: number }) {
    const [depositOpen, setDepositOpen] = useState(false);
    const [balance, setBalance] = useState(initialBalance);
    const [amount, setAmount] = useState(500);
    const [customAmount, setCustomAmount] = useState("500");
    const [phase, setPhase] = useState<Phase>("idle");
    const [curCard, setCurCard] = useState<Card>(() => pickVisualCard());
    const [drawnCard, setDrawnCard] = useState<Card | null>(null);
    const [multiplier, setMultiplier] = useState(1);
    const [history, setHistory] = useState<DrawHistory[]>([]);
    const [recents, setRecents] = useState<RecentRound[]>([
        { mult: 2.16, kind: "cashout" as const }, { mult: 0, kind: "loss" as const }, { mult: 4.5, kind: "cashout" as const }, { mult: 1.49, kind: "cashout" as const }, { mult: 0, kind: "loss" as const },
    ]);
    const [message, setMessage] = useState<string | null>(null);
    const [floatText, setFloatText] = useState<string | null>(null);
    const [roundId, setRoundId] = useState<string | null>(null);
    const [isDrawing, setIsDrawing] = useState(false); // true while API call is in-flight
    const winAudioRef = useRef<HTMLAudioElement | null>(null);
    const loseAudioRef = useRef<HTMLAudioElement | null>(null);
    const flipAudioRef = useRef<HTMLAudioElement | null>(null);
    const bgAudioRef = useRef<HTMLAudioElement | null>(null);

    const isPlaying = phase === "playing" || phase === "revealing" || phase === "starting";
    const potential = amount * multiplier;
    const profit = Math.max(0, potential - amount);

    useEffect(() => {
        const sfx = getSoundSettings().sfx;
        winAudioRef.current = new Audio("/sounds/win.mp3");
        loseAudioRef.current = new Audio("/sounds/loss.mp3");
        [winAudioRef.current, loseAudioRef.current, flipAudioRef.current].forEach((a) => { if (a) a.volume = sfx; });
        return () => {
            winAudioRef.current?.pause();
            loseAudioRef.current?.pause();
            flipAudioRef.current?.pause();
        };
    }, []);

    useEffect(() => {
        const bg = new Audio("/sounds/hi-lo/bg-sound.mp3");
        bg.loop = true;
        bg.volume = getSoundSettings().bgMusic;
        bg.play().catch(() => { });
        bgAudioRef.current = bg;
        return () => { bg.pause(); bg.src = ""; };
    }, []);

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

    useEffect(() => {
        return onSoundSettingsChange((s) => {
            [winAudioRef.current, loseAudioRef.current, flipAudioRef.current].forEach((a) => { if (a) a.volume = s.sfx; });
            if (bgAudioRef.current) bgAudioRef.current.volume = s.bgMusic;
        });
    }, []);

    const playAudio = useCallback((ref: React.RefObject<HTMLAudioElement | null>) => {
        if (!ref.current) return;
        ref.current.currentTime = 0;
        ref.current.play().catch(() => undefined);
    }, []);

    const refreshBalance = useCallback(async () => {
        try {
            const res = await fetch("/api/wallet/summary", { cache: "no-store" });
            if (res.ok) setBalance((await res.json()).balance);
        } catch { }
    }, []);

    const resetRound = useCallback((next?: Card) => {
        setPhase("idle");
        setMultiplier(1);
        setHistory([]);
        setDrawnCard(null);
        setRoundId(null);
        setIsDrawing(false);
        if (next) setCurCard(next);
    }, []);

    const setBet = (value: number) => {
        const next = Math.min(MAX_BET, Math.max(MIN_BET, value));
        setAmount(next);
        setCustomAmount(String(next));
    };

    const handleCustom = (value: string) => {
        setCustomAmount(value);
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) setAmount(Math.min(MAX_BET, Math.max(MIN_BET, n)));
    };

    // Server settle — server reads amount/multiplier from round outcome (not trusted from client)
    const settle = useCallback(async (rid: string, outcome: "cashed" | "lost") => {
        try {
            const res = await fetch("/api/games/hi-lo/settle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roundId: rid, outcome }),
            });
            const data = await res.json();
            if (res.ok) setBalance(data.newBalance);
        } catch { }
    }, []);

    const pick = useCallback(async (guess: Guess) => {
        if (phase === "revealing" || phase === "settled" || phase === "starting") return;
        if (amount > MAX_BET) return setMessage(`Max bet is PKR ${MAX_BET.toLocaleString()}.`);
        if ((amount < MIN_BET || amount > balance) && phase === "idle") { setDepositOpen(true); return; }
        playClick(); hapticTap(); playAudio(flipAudioRef);
        setMessage(null);
        setIsDrawing(true);

        let currentRoundId = roundId;
        let nextCard: Card;
        let win: boolean;
        let alreadySettled = false;

        if (phase === "idle") {
            // ── First pick: combine start + first draw in ONE request ──────────────
            // Previously: 2 sequential API calls (start then draw) = 2× latency.
            // Now: server does both in one round trip and returns the card result.
            setPhase("starting");
            try {
                const res = await fetch("/api/games/hi-lo", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount, direction: guess, currentRank: curCard.rank }),
                });
                const data = await res.json();
                if (!res.ok) {
                    setPhase("idle"); setIsDrawing(false);
                    setMessage(data.error ?? "Failed to start round.");
                    return;
                }
                currentRoundId = data.roundId;
                setRoundId(data.roundId);
                setBalance(data.newBalance);
                nextCard = data.nextCard as Card;
                win = data.win as boolean;
                alreadySettled = data.settled === true;
            } catch {
                setPhase("idle"); setIsDrawing(false);
                setMessage("Network error. Please try again.");
                return;
            }
        } else {
            // ── Subsequent picks: single draw API call ────────────────────────────
            setPhase("revealing");
            try {
                const res = await fetch("/api/games/hi-lo/draw", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ roundId: currentRoundId, currentRank: curCard.rank, direction: guess }),
                });
                const data = await res.json();
                if (!res.ok) {
                    setPhase("playing"); setIsDrawing(false);
                    setMessage(data.error ?? "Draw failed. Please try again.");
                    return;
                }
                nextCard = data.nextCard as Card;
                win = data.win as boolean;
                alreadySettled = data.settled === true;
            } catch {
                setPhase("playing"); setIsDrawing(false);
                setMessage("Network error. Please try again.");
                return;
            }
        }

        const slice    = guess === "hi" ? multFromProb(probHigher(curCard.rank)) : multFromProb(probLower(curCard.rank));
        const nextMult = multiplier * slice;

        setPhase("revealing");
        setDrawnCard(nextCard!);
        setIsDrawing(false);

        window.setTimeout(async () => {
            if (win!) {
                setMultiplier(nextMult);
                setHistory((h) => [...h, { card: nextCard!, win: true, mult: nextMult, guess }].slice(-MAX_HISTORY));
                setCurCard(nextCard!);
                setDrawnCard(null);
                setPhase("playing");
                setFloatText(`x${nextMult.toFixed(2)}`);
                window.setTimeout(() => setFloatText(null), 700);
            } else {
                hapticLoss(); playAudio(loseAudioRef);
                setHistory((h) => [...h, { card: nextCard!, win: false, mult: 0, guess }].slice(-MAX_HISTORY));
                setRecents((r) => [{ mult: 0, kind: "loss" as const }, ...r].slice(0, 8));
                setMessage(`Lost on ${RANK_LABEL[nextCard!.rank]}${SUITS[nextCard!.suit].glyph}`);
                setPhase("settled");
                // Draw endpoint already settled the loss in the same DB transaction —
                // no separate settle API call needed. Only cashouts require explicit settle.
                if (currentRoundId && !alreadySettled) settle(currentRoundId, "lost");
                window.setTimeout(() => resetRound(nextCard!), 1400);
            }
        }, 280); // reduced from 430ms — card animation is snappier
    }, [amount, balance, curCard.rank, multiplier, phase, playAudio, resetRound, roundId, settle]);

    const cashout = useCallback(async () => {
        if (phase !== "playing" || multiplier <= 1) return;
        playClick(); hapticWin(); playAudio(winAudioRef); fireWinConfetti();
        const payout = Number((amount * multiplier).toFixed(2));
        setRecents((r) => [{ mult: multiplier, kind: "cashout" as const }, ...r].slice(0, 8));
        setFloatText(`+PKR ${fmtPKR(payout - amount)}`);
        setMessage(`Cashed out @ ${multiplier.toFixed(2)}×`);
        setPhase("settled");
        if (roundId) {
            await settle(roundId, "cashed");
        }
        window.setTimeout(() => { setFloatText(null); resetRound(); }, 1300);
    }, [amount, multiplier, phase, playAudio, resetRound, roundId, settle]);

    const skipCard = useCallback(() => {
        if (phase !== "playing") return;
        playClick(); hapticTap();
        setCurCard((c) => pickVisualCard(c));
        setMessage("Card skipped — multiplier unchanged.");
        window.setTimeout(() => setMessage(null), 900);
    }, [phase]);

    const rulesSubtitle = useMemo(() => `Up to 49.50× • House ${HOUSE_EDGE * 100}%`, []);

    return (
        <>
        <GamesWrapper balance={balance} name="Hi-Lo" subtitle={rulesSubtitle} gameType="hi-lo" isPlaying={isPlaying} onDepositClose={refreshBalance}>
            <div className="relative flex min-h-[300px] flex-1 overflow-hidden bg-[radial-gradient(ellipse_80%_70%_at_50%_60%,rgba(242,154,11,0.16)_0%,transparent_70%),radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(100,80,200,0.12)_0%,transparent_60%),linear-gradient(180deg,#0a0812_0%,#0c0918_100%)] lg:min-h-0">
                <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2">
                    <div className="flex max-w-[95%] items-center gap-1.5 overflow-hidden rounded-full border border-white/[0.06] bg-black/45 px-2.5 py-1.5 backdrop-blur">
                        <span className="h-1.5 w-1.5 rounded-full bg-bp-win shadow-[0_0_10px_rgba(38,201,67,.8)]" />
                        <span className="mr-1 text-[9px] font-black uppercase tracking-[2px] text-white/45">Recent</span>
                        <div className="flex gap-1.5 overflow-hidden">{recents.map((r, i) => <RecentChip key={i} item={r} />)}</div>
                    </div>
                </div>

                <div className="absolute inset-x-0 bottom-[76px] top-[54px] flex flex-col items-center justify-center gap-3 px-3 sm:bottom-[88px]">
                    <div className="text-center">
                        <div className="text-[9px] font-black uppercase tracking-[4px] text-white/35">Multiplier</div>
                        <div className={`font-bp-mono text-[48px] font-black leading-none tracking-[-.06em] sm:text-[58px] ${multiplier > 1 ? "text-bp-accent drop-shadow-[0_0_22px_rgba(242,154,11,.35)]" : "text-white/85"}`}>
                            {multiplier.toFixed(2)}<span className="text-[.65em] opacity-70">×</span>
                        </div>
                    </div>

                    <div className="relative flex h-[268px] w-[280px] items-center justify-center sm:h-[304px] sm:w-[340px]">
                        <div className="absolute left-1/2 top-5 -translate-x-[33%] rotate-6 opacity-80"><CardBack /></div>
                        <div className={`absolute z-[2] transition-all duration-500 ${phase === "revealing" ? "-translate-x-12 rotate-[-7deg] opacity-75" : "translate-x-0 rotate-0"}`}>
                            <PlayingCard card={curCard} label="Current" glow={phase === "playing" && multiplier > 1} />
                        </div>
                        {/* Drawing loader — shown while API call is in-flight, before card arrives */}
                        {isDrawing && !drawnCard && (
                            <div className="absolute z-[3] translate-x-16 rotate-6 animate-pulse">
                                <CardBack className="opacity-80" />
                            </div>
                        )}
                        {drawnCard && (
                            <div className="absolute z-[3] translate-x-16 rotate-6 animate-[slideIn_.42s_ease-out]">
                                <PlayingCard card={drawnCard} label="Drawn" glow />
                            </div>
                        )}
                    </div>

                    <div className="min-h-8 text-center text-[12px] font-bold uppercase tracking-[2px] text-white/40">
                        {message ?? (
                            phase === "idle" ? "Pick Higher or Lower to start" :
                            phase === "starting" ? "Starting round…" :
                            phase === "revealing" ? "Drawing card…" :
                            `In play • Bet PKR ${fmtPKR(amount)}`
                        )}
                    </div>
                </div>

                {floatText && <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 font-bp-mono text-3xl font-black text-bp-win drop-shadow-[0_0_18px_rgba(38,201,67,.65)] animate-[floatUp_.75s_ease-out_forwards]">{floatText}</div>}

                <div className="absolute bottom-3 left-3 right-3 rounded-2xl border border-white/[0.06] bg-black/45 p-2.5 backdrop-blur">
                    <div className="mb-1.5 flex items-center justify-between text-[9px] font-black uppercase tracking-[2px] text-white/35">
                        <span>This Round</span><span className="font-bp-mono">{history.length} draws</span>
                    </div>
                    <div className="flex min-h-[76px] pt-1 items-center gap-2 overflow-hidden">
                        {history.length === 0 ? <div className="text-[11px] text-white/25">— drawn cards will appear here —</div> : history.map((h, i) => (
                            <div key={i} className="relative flex-shrink-0">
                                <PlayingCard card={h.card} small />
                                <div className={`absolute -top-1.5 right-[-5px] rounded-full px-1.5 py-0.5 font-bp-mono text-[9px] font-black ${h.win ? "bg-bp-win text-[#041006]" : "bg-bp-lose text-white"}`}>{h.win ? h.mult.toFixed(2) : "X"}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex w-full flex-shrink-0 flex-col gap-3 overflow-y-auto bg-gradient-to-b from-[rgba(8,10,20,0.82)] to-[rgba(10,8,18,1)] px-4 py-4 lg:w-[420px] lg:flex-1" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
                <GlassPanel className={phase !== "idle" ? "pointer-events-none opacity-55" : ""}>
                    <div className="mb-3 text-[12px] uppercase tracking-[2px] text-white/45">Bet Amount</div>
                    <div className="grid grid-cols-4 gap-2">
                        {PRESETS.map((p) => <button key={p} onClick={() => { playClick(); setBet(p); }} className={`rounded-xl border py-1.5 font-bp-mono text-sm font-bold transition-colors ${amount === p ? "border-bp-accent/50 bg-bp-accent/15 text-bp-accent" : "border-white/[0.06] bg-black/25 text-white/75 hover:bg-black/40"}`}>{p >= 1000 ? `${p / 1000}k` : p}</button>)}
                    </div>
                    <div className="mt-3 flex gap-2">
                        <div className="relative flex-1"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-white/40">PKR</span><input type="number" value={customAmount} onChange={(e) => handleCustom(e.target.value)} min={MIN_BET} max={MAX_BET} className="w-full rounded-2xl border border-white/[0.06] bg-black/30 py-3.5 pl-14 pr-3 font-bp-mono text-[17px] font-bold text-white outline-none focus:border-bp-accent/40" /></div>
                        <button onClick={() => { playClick(); setBet(amount / 2); }} className="min-w-[58px] rounded-2xl border border-white/[0.06] bg-black/30 px-3 font-bp-mono text-lg font-bold text-white/85">½</button>
                        <button onClick={() => { playClick(); setBet(amount * 2); }} className="min-w-[58px] rounded-2xl border border-white/[0.06] bg-black/30 px-3 font-bp-mono text-lg font-bold text-white/85">2×</button>
                    </div>
                </GlassPanel>

                <div className="grid grid-cols-3 gap-2">
                    <StatCard label="Potential" value={`PKR ${potential >= 1000 ? `${(potential / 1000).toFixed(1)}k` : potential.toFixed(0)}`} />
                    <StatCard label="Profit" value={`+${profit >= 1000 ? `${(profit / 1000).toFixed(1)}k` : profit.toFixed(0)}`} />
                    <StatCard label="Streak" value={`${history.filter((h) => h.win).length}`} accent />
                </div>

                <GlassPanel>
                    <div className="mb-3 flex items-center justify-between"><div className="text-[12px] uppercase tracking-[2px] text-white/45">Choose Next Card</div><div className="font-bp-mono text-[11px] text-white/35">Tie loses</div></div>
                    <div className="flex flex-col gap-2">
                        <GuessButton guess="hi" rank={curCard.rank} multiplier={multiplier} disabled={phase === "revealing" || phase === "settled" || phase === "starting"} onClick={() => pick("hi")} />
                        <GuessButton guess="lo" rank={curCard.rank} multiplier={multiplier} disabled={phase === "revealing" || phase === "settled" || phase === "starting"} onClick={() => pick("lo")} />
                    </div>
                    <button onClick={skipCard} disabled={phase !== "playing"} className="mt-2 w-full rounded-2xl border border-dashed border-white/[0.14] bg-transparent py-2.5 text-[12px] font-black uppercase tracking-[1.5px] text-white/45 disabled:cursor-not-allowed disabled:opacity-35">Skip Card</button>
                </GlassPanel>

                <button onClick={cashout} disabled={phase !== "playing" || multiplier <= 1} className="rounded-3xl border-0 bg-gradient-to-b from-bp-accent to-[#c97e08] py-4 font-bp-ui text-[17px] font-black uppercase tracking-[2px] text-[#1b1305] shadow-[0_4px_18px_rgba(242,154,11,0.45)] transition-all hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-none disabled:bg-white/[0.05] disabled:text-white/35 disabled:shadow-none">
                    {phase === "playing" && multiplier > 1 ? <>Cash Out <span className="font-bp-mono">PKR {fmtPKR(potential)}</span></> : "Cash Out"}
                </button>

                <div className="text-center text-[10px] uppercase tracking-[1.6px] text-white/25">Provably fair • Max bet PKR {MAX_BET.toLocaleString()} • 1% edge</div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes floatUp { from { opacity: 0; transform: translate(-50%, 20px) scale(.96); } 18% { opacity: 1; } to { opacity: 0; transform: translate(-50%, -54px) scale(1.04); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(105px) rotate(12deg) scale(.92); } to { opacity: 1; transform: translateX(64px) rotate(6deg) scale(1); } }
      ` }} />
        </GamesWrapper>
        <DepositSheet includePaddingBottom={false} open={depositOpen} onClose={async () => { setDepositOpen(false); await refreshBalance(); }} />
        </>
    );
}
