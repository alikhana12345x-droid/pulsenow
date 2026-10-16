"use client";

import { ArrowDownToLine, BookOpen, ChevronLeft, History, Maximize2, MoreVertical, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { GameModal } from "./game-modal";
import { DepositSheet } from "@/components/deposit-sheet";
import { playClick } from "@/lib/sound";
import { getSoundSettings, setSoundSettings, SoundSettings } from "@/lib/sound-settings";
import { clearFsWarnSnooze, isFsWarnSnoozed, snoozeFsWarn } from "@/lib/fs-warn";
import { useWakeLock } from "@/lib/hooks/use-wake-lock";
import { useGameExit } from "@/components/lobby/game-exit-context";


// ─── Types ────────────────────────────────────────────────────────────────────

// This wrapper hosts the full-bleed "live" games (SkyRise, Dragon vs Tiger). The
// other games (dice, coinflip, hi-lo, mines) use the separate <GamesWrapper>, so
// configs for them don't belong here.
export type GameType = "skyrise" | "dragon-tiger" | "teen-patti";

type ModalType = "reminder" | "rules" | "records" | "fullscreen" | "sounds" | null;

// How many non-fullscreen rounds before the warning surfaces
const FS_WARN_AFTER = 3;

type BetRecord = {
    id: string;
    amount: string | number;
    payout: string | number;
    profit: string | number;
    created_at: string;
};

// ─── Game rules content ───────────────────────────────────────────────────────

const GAME_RULES: Record<
    GameType,
    { intro: string; sections: { title: string; items: string[] }[] }
> = {
    skyrise: {
        intro:
            "[AVIATOR] is a multiplayer crash game. A plane takes off and the multiplier rises — cash out before it crashes or lose your bet. The crash point is random each round.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Place a bet (or two!) during the betting phase.",
                    "2. When the plane takes off, the multiplier climbs.",
                    "3. Press Cash Out at any time to lock in your winnings.",
                    "4. If the plane crashes before you cash out, your bet is lost.",
                    "5. Use Auto Bet and Auto Cash Out for hands-free play.",
                ],
            },
            {
                title: "III. Payouts",
                items: [
                    "Payout = Bet × Multiplier at cash-out.",
                    "House edge: 3%.",
                    "Crash point is determined by a provably fair algorithm before the round starts.",
                    "Example: Bet PKR 500, cash out at 3.00× → receive PKR 1,500.",
                ],
            },
        ],
    },
    "dragon-tiger": {
        intro:
            "[DRAGON VS TIGER] is a live card table. Every round, one card is dealt to Dragon and one to Tiger — the higher card wins (Ace is lowest, King is highest). Bet on Dragon, Tiger, or a Tie before the countdown ends.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Pick a chip and tap a zone (Dragon, Tie or Tiger) while \"Start Betting\" counts down.",
                    "2. Tap again to add more — you can bet multiple zones in the same round.",
                    "3. When betting ends, both cards are revealed and the higher card wins.",
                    "4. Use Continue to instantly re-place your previous round's bets.",
                ],
            },
            {
                title: "III. Payouts",
                items: [
                    "Dragon pays 1:1 (bet PKR 100 → receive PKR 200).",
                    "Tiger pays 1:1 (bet PKR 100 → receive PKR 200).",
                    "Tie pays 8:1 (bet PKR 100 → receive PKR 900).",
                    "If the round is a Tie, Dragon and Tiger bets are lost.",
                    "Bet limits: PKR 10 – 20,000 per round.",
                ],
            },
        ],
    },
    "teen-patti": {
        intro:
            "[TEEN PATTI 20-20] is a live card table. Every round two three-card hands are dealt — Player A and Player B — and the better hand wins. Back a side, or take the Pair Plus side bet on either hand finishing Pair-or-better.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Pick a chip and tap a zone (Player A, Pair+ A, Pair+ B or Player B) while \"Start Betting\" counts down.",
                    "2. Tap again to add more — you can bet multiple zones in the same round.",
                    "3. When betting ends, both hands are revealed and the better hand wins.",
                    "4. Use Continue to instantly re-place your previous round's bets.",
                ],
            },
            {
                title: "III. Hand Ranking (high to low)",
                items: [
                    "Trail (three of a kind) — beats everything.",
                    "Pure Sequence (a run in one suit).",
                    "Sequence (a run in mixed suits).",
                    "Colour (three of one suit).",
                    "Pair (two of the same rank).",
                    "High Card — the lowest hand.",
                    "Ace is HIGH. A-K-Q is the best sequence and A-2-3 is the second best.",
                ],
            },
            {
                title: "IV. Payouts",
                items: [
                    "Player A pays 1.96× (bet PKR 100 → receive PKR 196).",
                    "Player B pays 1.96× (bet PKR 100 → receive PKR 196).",
                    "Pair+ pays 3.70× if that hand is Pair-or-better (bet PKR 100 → receive PKR 370).",
                    "Pair+ is settled on its own hand — it can win even when that side loses the round.",
                    "If both hands tie exactly, the round is re-dealt — no bet is settled on a tie.",
                    "Bet limits: PKR 10 – 20,000 per round.",
                ],
            },
        ],
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPKR(n: number) {
    return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GamesNativeWrapper({
    children,
    balance,
    name,
    subtitle = "Crash · Plane",
    gameType,
    isPlaying = false,
    stopAutoPlay,
    onDepositClose,
    autoPlay = false,
}: {
    children: React.ReactNode;
    balance: number;
    name: string;
    subtitle?: string;
    gameType: GameType;
    isPlaying?: boolean;
    stopAutoPlay?: () => void;
    onDepositClose?: () => Promise<void>;
    autoPlay?: boolean;
}) {
    const router = useRouter();
    const lobbyExit = useGameExit();

    const [modal, setModal] = useState<ModalType>(null);
    const [moreOpen, setMoreOpen] = useState(false);
    const [records, setRecords] = useState<BetRecord[]>([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [depositOpen, setDepositOpen] = useState(false);
    const [showPlayingWarn, setShowPlayingWarn] = useState(false);
    const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const isFullscreenRef = useRef(false);
    // Counts rounds completed outside fullscreen this session
    const gamesWithoutFSRef = useRef(0);
    const prevPlayingRef = useRef(false);
    // Set when user explicitly dismisses the warning — cleared on lobby return (unmount)
    const fsWarnDeclinedRef = useRef(false);
    const [isOffline, setIsOffline] = useState(false);

    // ── Sound settings ───────────────────────────────────────────────────────────
    const [soundCfg, setSoundCfg] = useState<SoundSettings>(() => getSoundSettings());
    const handleSoundChange = useCallback((key: keyof SoundSettings, val: number) => {
        setSoundCfg(setSoundSettings({ [key]: val }));
    }, []);

    // Fullscreen is requested by the LOBBY when the game is opened (see openGame
    // in lobby-inner.tsx) — that click is the only user gesture available, and
    // requestFullscreen() is rejected without one. This wrapper deliberately does
    // NOT request it: it previously latched onto the first pointerdown anywhere in
    // the game, which threw the player into fullscreen on their first bet tap.
    // The "Better in Fullscreen" prompt below is the recovery path for sessions
    // that started windowed (deep links, or after the player pressed Esc).

    // ── Track fullscreen state ───────────────────────────────────────────────────
    useEffect(() => {
        const onChange = () => {
            const fs = !!document.fullscreenElement;
            isFullscreenRef.current = fs;
            setIsFullscreen(fs);
        };
        document.addEventListener("fullscreenchange", onChange);
        const initial = !!document.fullscreenElement;
        isFullscreenRef.current = initial;
        setIsFullscreen(initial);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    // ── Dismiss fullscreen modal and reset counter when fullscreen is restored ───
    useEffect(() => {
        if (isFullscreen) {
            gamesWithoutFSRef.current = 0;
            fsWarnDeclinedRef.current = false;
            clearFsWarnSnooze();
            setModal((prev) => (prev === "fullscreen" ? null : prev));
        }
    }, [isFullscreen]);

    // ── Show fullscreen warning after FS_WARN_AFTER rounds outside fullscreen ────
    // Only fires once per session after the threshold; suppressed if user declined.
    useEffect(() => {
        const wasPlaying = prevPlayingRef.current;
        prevPlayingRef.current = isPlaying;
        if (!document.documentElement.requestFullscreen) return; // iOS Safari: no FS API
        if (wasPlaying && !isPlaying && !isFullscreenRef.current) {
            gamesWithoutFSRef.current += 1;
            if (
                gamesWithoutFSRef.current >= FS_WARN_AFTER &&
                !fsWarnDeclinedRef.current &&
                !isFsWarnSnoozed()
            ) {
                setModal("fullscreen");
            }
        }
    }, [isPlaying]);

    // ── Block zoom (ctrl+wheel, ctrl+keyboard) and pull-to-refresh ─────────────
    useEffect(() => {
        const onWheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && ["=", "+", "-", "0"].includes(e.key)) e.preventDefault();
        };
        document.addEventListener("wheel", onWheel, { passive: false });
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("wheel", onWheel);
            document.removeEventListener("keydown", onKey);
        };
    }, []);

    // ── Block browser back + page refresh during active round ──────────────────
    useEffect(() => {
        if (!isPlaying) return;
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.history.pushState(null, "", window.location.href);
        const handlePopState = () => {
            window.history.pushState(null, "", window.location.href);
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        window.addEventListener("popstate", handlePopState);
        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            window.removeEventListener("popstate", handlePopState);
        };
    }, [isPlaying]);

    // ── Keep screen awake during autoplay / active round ───────────────────────
    useWakeLock(autoPlay || isPlaying);


    // ── Offline guard: notify and stop autoplay if connection drops ────────────
    useEffect(() => {
        const onOffline = () => { setIsOffline(true); stopAutoPlay?.(); };
        const onOnline = () => setIsOffline(false);
        window.addEventListener("offline", onOffline);
        window.addEventListener("online", onOnline);
        return () => {
            window.removeEventListener("offline", onOffline);
            window.removeEventListener("online", onOnline);
        };
    }, [stopAutoPlay]);

    // ── Show "round in progress" toast ─────────────────────────────────────────
    const warnPlaying = useCallback(() => {
        setShowPlayingWarn(true);
        if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
        warnTimerRef.current = setTimeout(() => setShowPlayingWarn(false), 2000);
    }, []);

    // ── Records fetch ────────────────────────────────────────────────────────────
    const openRecords = useCallback(async () => {
        setMoreOpen(false);
        setModal("records");
        setRecordsLoading(true);
        try {
            const res = await fetch(`/api/games/history?game=${gameType}`);
            const data = await res.json();
            setRecords(Array.isArray(data) ? data : []);
        } catch {
            setRecords([]);
        }
        setRecordsLoading(false);
    }, [gameType]);

    const rules = GAME_RULES[gameType];

    const isLocked = isPlaying || autoPlay;

    useEffect(() => {
        if (isLocked) setMoreOpen(false);
    }, [isLocked]);

    // ── Shared button actions ────────────────────────────────────────────────────
    const handleBack = useCallback(() => {
        playClick();
        if (isPlaying) { warnPlaying(); return; }
        if (autoPlay) return;
        setModal("reminder");
    }, [isPlaying, autoPlay, warnPlaying]);

    // Lobby-hosted games close instantly via context (the lobby is already
    // mounted underneath); standalone /protected/games/* routes still navigate.
    const returnToLobby = useCallback(() => {
        setModal(null);
        // closeGame() already drops fullscreen on the lobby path.
        if (lobbyExit) { lobbyExit(); return; }
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { });
        router.push("/");
    }, [lobbyExit, router]);

    const handleDeposit = useCallback(() => {
        if (isPlaying) { warnPlaying(); return; }
        if (autoPlay) return;
        setDepositOpen(true);
    }, [isPlaying, autoPlay, warnPlaying]);

    // ── Modals ───────────────────────────────────────────────────────────────────
    const fullscreenModal = (
        <GameModal open={modal === "fullscreen"} onClose={() => { fsWarnDeclinedRef.current = true; snoozeFsWarn(); setModal(null); }} variant="reminder" title="Better in Fullscreen">
            <div className="flex flex-col items-center gap-3 pb-1">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-bp-accent/30 bg-bp-accent/10">
                    <Maximize2 className="h-7 w-7 text-bp-accent" />
                </div>
                <p className="text-center text-[13px] leading-relaxed text-white/50">
                    You&apos;re playing outside fullscreen mode.
                    <br />
                    <span className="mt-1 block text-[12px] text-white/35">
                        Fullscreen hides distractions and gives you the best experience.
                    </span>
                </p>
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
                <button
                    onClick={() => { document.documentElement.requestFullscreen?.().catch(() => { }); setModal(null); }}
                    className="w-full rounded-2xl bg-gradient-to-b from-bp-accent to-[#c97e08] py-3 text-[14px] font-black uppercase tracking-wider text-[#1b1305] shadow-[0_2px_12px_rgba(242,154,11,0.4)] transition-all hover:opacity-95"
                >
                    Go Fullscreen
                </button>
                <button
                    onClick={() => { fsWarnDeclinedRef.current = true; snoozeFsWarn(); gamesWithoutFSRef.current = 0; setModal(null); }}
                    className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] py-3 text-[14px] font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white"
                >
                    Not Now
                </button>
            </div>
        </GameModal>
    );

    const reminderModal = (
        <GameModal open={modal === "reminder"} onClose={() => setModal(null)} variant="reminder" title="Leave Game?">
            <p className="mb-5 text-center text-[13px] leading-relaxed text-white/50">
                You can deposit from the lobby without losing your session.
                <br />
                <span className="mt-1.5 block font-bp-mono text-[13px] font-bold text-bp-accent">PKR {fmtPKR(balance)}</span>
                <span className="text-[11px]">current balance</span>
            </p>
            <div className="flex flex-col gap-2.5">
                <button onClick={() => { setModal(null); setDepositOpen(true); }}
                    className="w-full rounded-2xl bg-gradient-to-b from-bp-accent to-[#c97e08] py-3 text-[14px] font-black uppercase tracking-wider text-[#1b1305] shadow-[0_2px_12px_rgba(242,154,11,0.4)] transition-all hover:opacity-95">
                    Deposit Now
                </button>
                <button onClick={returnToLobby}
                    className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] py-3 text-[14px] font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white">
                    Return to Lobby
                </button>
                <button onClick={() => setModal(null)}
                    className="w-full py-2 text-[12px] text-white/30 transition-colors hover:text-white/50">
                    Continue Playing
                </button>
            </div>
        </GameModal>
    );

    const rulesModal = (
        <GameModal open={modal === "rules"} onClose={() => setModal(null)} variant="info" title="Rules">
            <div className="space-y-5 bg-[#111] p-4 text-[13px] leading-relaxed text-white/70">
                <div>
                    <p className="mb-2 border-l-2 border-bp-accent pl-2.5 text-[11px] font-bold uppercase tracking-wider text-bp-accent">I. Game Introduction</p>
                    <p>{rules.intro}</p>
                </div>
                {rules.sections.map((section) => (
                    <div key={section.title}>
                        <p className="mb-2 border-l-2 border-bp-accent pl-2.5 text-[11px] font-bold uppercase tracking-wider text-bp-accent">{section.title}</p>
                        <div className="space-y-2">{section.items.map((item, i) => <p key={i}>{item}</p>)}</div>
                    </div>
                ))}
                <p className="border-t border-white/[0.06] pt-3 text-[11px] text-white/30">All outcomes are provably fair and cryptographically verifiable.</p>
            </div>
        </GameModal>
    );

    const recordsModal = (
        <GameModal open={modal === "records"} onClose={() => setModal(null)} variant="info" title="Bet Records">
            <div className="bg-bp-bg">
                {records.length > 0 && (() => {
                    const totalPnL = records.reduce((s, r) => s + Number(r.profit), 0);
                    return (
                        <div className="flex items-center justify-between border-b border-white/[0.06] bg-bp-mid px-4 py-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
                                {records.length} bet{records.length !== 1 ? "s" : ""}
                            </span>
                            <span className={`font-bp-mono text-[12px] font-bold ${totalPnL >= 0 ? "text-bp-win" : "text-bp-lose"}`}>
                                {totalPnL >= 0 ? "+" : "−"}PKR {Math.abs(totalPnL).toFixed(0)}
                            </span>
                        </div>
                    );
                })()}
                <div className="grid grid-cols-[1.3fr_0.9fr_0.7fr_1fr] border-b border-white/[0.06] bg-bp-mid px-4 py-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">
                    <span>Time</span><span className="text-center">Bet</span><span className="text-center">Mult</span><span className="text-right">Profit</span>
                </div>
                {recordsLoading ? (
                    <div className="flex items-center justify-center gap-2.5 py-12 text-[12px] text-white/25">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-bp-accent" />
                        Loading…
                    </div>
                ) : records.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12">
                        <div className="text-[13px] text-white/25">No bets yet</div>
                        <div className="text-[10px] text-white/15">Play a round to see your history</div>
                    </div>
                ) : (
                    <div className="divide-y divide-white/[0.04]">
                        {records.map((r) => {
                            const amt = Number(r.amount);
                            const payout = Number(r.payout);
                            const profit = Number(r.profit);
                            const won = profit >= 0;
                            const mult = won && amt > 0 ? payout / amt : 0;
                            return (
                                <div key={r.id} className="grid grid-cols-[1.3fr_0.9fr_0.7fr_1fr] px-4 py-2.5 text-[12px] transition-colors hover:bg-white/[0.02]">
                                    <span className="font-bp-mono text-white/35">
                                        {new Date(r.created_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                                    </span>
                                    <span className="text-center font-bp-mono text-white/55">{amt.toFixed(0)}</span>
                                    <span className={`text-center font-bp-mono text-[11px] font-bold ${won && mult > 0 ? "text-bp-accent" : "text-white/20"}`}>
                                        {won && mult > 0 ? `${mult.toFixed(2)}×` : "—"}
                                    </span>
                                    <span className={`text-right font-bp-mono font-bold ${won ? "text-bp-win" : "text-bp-lose"}`}>
                                        {won ? "+" : "−"}PKR {Math.abs(profit).toFixed(0)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
                <div className="border-t border-white/[0.06] px-4 py-2 text-center text-[10px] text-white/20">
                    Last 30 bets · Provably fair
                </div>
            </div>
        </GameModal>
    );

    const soundsModal = (
        <GameModal open={modal === "sounds"} onClose={() => setModal(null)} variant="info" title="Sound Settings">
            <div className="space-y-6 bg-bp-bg p-5">
                {([
                    { key: "sfx" as const, label: "SFX / Buttons", sub: "Button clicks & game action sounds" },
                    { key: "bgMusic" as const, label: "Background Music", sub: "Ambient loop while in-game" },
                ] as const).map(({ key, label, sub }) => (
                    <div key={key}>
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <div className="text-[13px] font-semibold text-white/80">{label}</div>
                                <div className="mt-0.5 text-[11px] text-white/35">{sub}</div>
                            </div>
                            <span className="font-bp-mono text-[14px] font-bold text-bp-accent">{Math.round(soundCfg[key] * 100)}%</span>
                        </div>
                        <div className="relative flex items-center gap-3">
                            <span className="w-5 text-center text-[10px] text-white/25">Off</span>
                            <div className="relative flex-1 py-2">
                                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                                    <div className="h-full rounded-full bg-gradient-to-r from-bp-accent/50 to-bp-accent transition-[width]" style={{ width: `${soundCfg[key] * 100}%` }} />
                                </div>
                                <input type="range" min={0} max={1} step={0.01} value={soundCfg[key]}
                                    onChange={(e) => handleSoundChange(key, parseFloat(e.target.value))}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                                <div className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 bg-[radial-gradient(circle_at_35%_30%,#fff_0%,#f29a0b_80%)] shadow-[0_2px_10px_rgba(242,154,11,0.6)]"
                                    style={{ left: `${soundCfg[key] * 100}%` }} />
                            </div>
                            <span className="w-5 text-center text-[10px] text-white/25">Max</span>
                        </div>
                    </div>
                ))}

                {/* Vibration toggle */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[13px] font-semibold text-white/80">Vibration</div>
                        <div className="mt-0.5 text-[11px] text-white/35">Haptic feedback on win / loss</div>
                    </div>
                    <button
                        onClick={() => setSoundCfg(setSoundSettings({ vibration: !soundCfg.vibration }))}
                        className={`relative h-7 w-12 rounded-full border transition-colors ${soundCfg.vibration ? "border-bp-accent/40 bg-bp-accent/20" : "border-white/[0.08] bg-white/[0.05]"}`}
                    >
                        <span
                            className={`absolute top-1 h-5 w-5 rounded-full transition-[left,background-color] ${soundCfg.vibration ? "left-[calc(100%-1.375rem)] bg-bp-accent" : "left-1 bg-white/30"}`}
                        />
                    </button>
                </div>
            </div>
        </GameModal>
    );

    // ── Unified header (works on all screen sizes) ───────────────────────────────
    const header = (
        <header
            className="flex flex-shrink-0 items-center justify-between border-b border-white/5 bg-black/30 px-4 pb-2 md:pb-3 backdrop-blur-sm"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
            <div className="flex items-center gap-2.5">
                <button
                    onClick={handleBack}
                    disabled={isLocked}
                    className={`flex md:px-3 md:py-2 px-2 py-2 flex-shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isLocked ? "" : "text-[#c4bde0] hover:text-white active:scale-95"}`}
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div>
                    <div className="text-[17px] font-black leading-none tracking-tight text-bp-text">{name}</div>
                    <div className="mt-0.5 hidden whitespace-nowrap text-[10px] uppercase tracking-[2px] text-white/35 min-[380px]:block">{subtitle}</div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={handleDeposit}
                    disabled={isLocked}
                    className="flex items-center gap-1.5 rounded-xl border border-bp-accent/30 bg-bp-accent/10 md:px-3 md:py-2 px-2 py-2 text-[12px] font-bold uppercase tracking-wide text-bp-accent transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <ArrowDownToLine className="h-4 w-4" />
                    <span className="hidden sm:inline">Deposit</span>
                </button>

                <button
                    onClick={() => setMoreOpen((v) => !v)}
                    disabled={isLocked}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${moreOpen ? "border-white/20 bg-white/10 text-white" : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white"}`}
                >
                    <MoreVertical className="h-[18px] w-[18px]" />
                </button>

                <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[2px] text-white/40">Balance</div>
                    <div className="font-bp-mono text-[15px] font-bold leading-none text-bp-text">
                        <span className="mr-0.5 text-[10px] text-white/40">PKR</span>
                        {fmtPKR(balance)}
                    </div>
                </div>
            </div>
        </header>
    );

    // ── Playing toast ────────────────────────────────────────────────────────────
    const playingToast = showPlayingWarn && (
        <div className="pointer-events-none absolute left-0 right-0 z-[60] flex justify-center"
            style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 56px)" }}>
            <div className="rounded-2xl border border-bp-accent/30 bg-black/85 px-5 py-2.5 text-[13px] font-bold text-bp-accent shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-sm">
                Round in progress — wait for result
            </div>
        </div>
    );

    // ── Offline toast ─────────────────────────────────────────────────────────────
    const offlineToast = isOffline && (
        <div className="pointer-events-none absolute inset-x-0 z-[65] flex justify-center px-4"
            style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 60px)" }}>
            <div className="flex items-center gap-2 rounded-2xl border border-red-500/40 bg-black/90 px-5 py-2.5 text-[13px] font-bold text-red-400 shadow-[0_4px_20px_rgba(0,0,0,0.7)] backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                No connection — autoplay stopped
            </div>
        </div>
    );

    // ── More dropdown ────────────────────────────────────────────────────────────
    const moreDropdown = moreOpen && (
        <>
            <div className="absolute inset-0 z-[40]" onClick={() => setMoreOpen(false)} />
            <div className="absolute right-3 z-[50] min-w-[148px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0c1a] shadow-[0_8px_32px_rgba(0,0,0,0.65)]"
                style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 54px)" }}>
                <button onClick={openRecords} className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white">
                    <History className="h-4 w-4 text-bp-accent" />Records
                </button>
                <div className="mx-3 border-t border-white/[0.06]" />
                <button onClick={() => { setMoreOpen(false); setModal("rules"); }} className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white">
                    <BookOpen className="h-4 w-4 text-bp-accent" />Rules
                </button>
                <div className="mx-3 border-t border-white/[0.06]" />
                <button onClick={() => { setMoreOpen(false); setModal("sounds"); }} className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white">
                    <Volume2 className="h-4 w-4 text-bp-accent" />Sounds
                </button>
            </div>
        </>
    );

    // ── Unified responsive layout (no fixed-width scaling) ───────────────────────
    return (
        <main
            className="relative flex h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-bp-mid to-bp-bg font-bp-ui text-white select-none"
            style={{ touchAction: "pan-x pan-y", WebkitTapHighlightColor: "transparent", overscrollBehavior: "none" }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {header}
            {playingToast}
            {offlineToast}
            {moreDropdown}
            <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
                {children}
            </div>
            {reminderModal}
            {rulesModal}
            {recordsModal}
            {fullscreenModal}
            {soundsModal}
            <DepositSheet includePaddingBottom={false} open={depositOpen} onClose={async () => { setDepositOpen(false); await onDepositClose?.(); }} />
        </main>
    );
}
