"use client";

import { ArrowDownToLine, BookOpen, ChevronLeft, History, Maximize2, MoreVertical, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GameModal } from "./game-modal";
import { DepositSheet } from "@/components/deposit-sheet";
import { playClick } from "@/lib/sound";
import { getSoundSettings, setSoundSettings, SoundSettings } from "@/lib/sound-settings";
import { clearFsWarnSnooze, isFsWarnSnoozed, snoozeFsWarn } from "@/lib/fs-warn";
import { useWakeLock } from "@/lib/hooks/use-wake-lock";
import { useGameExit } from "@/components/lobby/game-exit-context";


// ─── Constants ────────────────────────────────────────────────────────────────

const DESIGN_W = 720;

// How many non-fullscreen rounds before the nudge surfaces
const FS_WARN_AFTER = 3;

export type GameType = "dice" | "coinflip" | "skyrise" | "mines" | "hi-lo" | "limbo" | "dragon-tower" | "andar-bahar" | "plinko" | "keno";

type MobileTransform = { scale: number; designHeight: number };
type ModalType = "reminder" | "rules" | "records" | "fullscreen" | "sounds" | null;

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
            "[SKYRISE] is a multiplayer crash game. A rocket launches and the multiplier rises — cash out before it crashes or lose your bet. The crash point is random each round.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Place a bet (or two!) during the betting phase.",
                    "2. When the rocket launches, the multiplier climbs.",
                    "3. Press Cash Out at any time to lock in your winnings.",
                    "4. If the rocket crashes before you cash out, your bet is lost.",
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
    dice: {
        intro:
            "[DICE 3D] is a prediction game where you choose a target number and predict whether the roll will be OVER or UNDER. Multipliers adjust based on your target.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Select OVER or UNDER mode.",
                    "2. Set your target number using the slider (2 – 97).",
                    "3. Enter your bet amount (min PKR 10, max PKR 50,000).",
                    "4. Press Roll Dice. A number between 0.00–99.99 is generated.",
                    "   OVER: you win if the roll is above your target.",
                    "   UNDER: you win if the roll is below your target.",
                ],
            },
            {
                title: "III. Payouts",
                items: [
                    "Win Chance = winning outcomes / 99.",
                    "Multiplier = (1 − 0.01) / Win Chance. House edge is 1%.",
                    "Maximum win chance is capped at 95%.",
                    "Example — Target 50, OVER: 49% chance → 2.00× payout.",
                    "Example — Target 10, OVER: 89% chance → 1.11× payout.",
                ],
            },
        ],
    },
    mines: {
        intro:
            "[MINES] is a provably fair grid game. Reveal gems on a 5×5 board while avoiding hidden mines. Cash out any time — the further you go, the higher the multiplier.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Set your bet amount and choose how many mines (1, 3, 5, 10, or 24).",
                    "2. Press Bet to start the round — your bet is deducted immediately.",
                    "3. Click tiles to reveal them. A gem is safe; a mine ends the round.",
                    "4. Press Cash Out at any time to collect your current multiplier.",
                    "5. Reveal all safe tiles to auto-collect the maximum multiplier.",
                ],
            },
            {
                title: "III. Payouts",
                items: [
                    "Multiplier = (1 − 0.01) × C(25, k) / C(25 − mines, k), where k = gems revealed.",
                    "House edge: 1%.",
                    "More mines = higher multiplier per gem, but greater risk.",
                    "Example: 5 mines, 3 gems revealed → ≈ 1.86× payout.",
                    "Crash point is determined by a provably fair seed before the round starts.",
                ],
            },
        ],
    },
    coinflip: {
        intro:
            "[COIN FLIP] is a 50/50 game. Pick Heads or Tails, flip the coin, and win at 1.96× if you're right!",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Select Heads or Tails.",
                    "2. Enter your bet amount (min PKR 10, max PKR 20,000).",
                    "3. Press Flip Coin. The result is randomly determined.",
                    "4. If the coin lands on your pick, you win!",
                ],
            },
            {
                title: "III. Payouts",
                items: [
                    "Win Chance: 50% for both Heads and Tails.",
                    "Payout Multiplier: fixed at 1.96×.",
                    "House Edge: 2%.",
                    "Example: Bet PKR 100 → win PKR 96 profit (receive PKR 196 total).",
                ],
            },
        ],
    },
    limbo: {
        intro:
            "[LIMBO] is a pure multiplier game. Set a target multiplier, then roll — if the result lands at or above your target, you win at exactly that multiplier. The higher your target, the bigger the payout and the rarer the win.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Set your bet amount (min PKR 10, max PKR 20,000).",
                    "2. Choose a target multiplier (1.05× – 1000×).",
                    "3. Press Roll. A random multiplier is generated instantly.",
                    "4. Win if the result is greater than or equal to your target.",
                    "5. Use Auto for hands-free rounds.",
                ],
            },
            {
                title: "III. Payouts",
                items: [
                    "Payout = Bet × your target multiplier.",
                    "Win chance = (1 − 0.01) / target. House edge 1%.",
                    "Example — Target 2.00×: ~49.5% win chance → double your bet.",
                    "Example — Target 10.00×: ~9.9% win chance → 10× your bet.",
                    "Higher targets pay more but win far less often.",
                ],
            },
        ],
    },
    keno: {
        intro:
            "[KENO] is a lottery-style number game. Pick up to 10 numbers from a grid of 40, then the house draws 10. The more of your numbers that are drawn, the bigger your payout.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Set your bet amount (min PKR 10, max PKR 20,000).",
                    "2. Pick 1–10 numbers from the 40-number grid (or use Quick Pick).",
                    "3. Press Play. The house draws 10 numbers, revealed one at a time.",
                    "4. Payout depends on how many of your picks are hit — see the live paytable.",
                ],
            },
            {
                title: "III. Payouts",
                items: [
                    "Each pick count has its own paytable (hits → multiplier).",
                    "House edge: ~1% baked into the paytable.",
                    "Fewer picks = hit more often for smaller multipliers; more picks = rarer, bigger wins.",
                    "Max payout: up to 1000× on the hardest pick counts.",
                ],
            },
        ],
    },
    plinko: {
        intro:
            "[PLINKO] drops a ball through a field of pegs. It bounces left or right at each row and lands in a multiplier bucket at the bottom. Centre buckets are common and pay little; the rare edge buckets pay big.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Set your bet amount (min PKR 10, max PKR 20,000).",
                    "2. Choose the number of rows (8 / 12 / 16) and a risk level (Low / Medium / High).",
                    "3. Press Drop. The ball falls and settles into a bucket.",
                    "4. Payout = bet × the bucket's multiplier (which can be below 1× or above 1000×).",
                ],
            },
            {
                title: "III. Payouts",
                items: [
                    "Each bucket has a fixed multiplier; higher risk widens the spread.",
                    "House edge: 1% baked into the multiplier table.",
                    "Low risk: frequent small results near 1×. High risk: rare large multipliers at the edges.",
                    "Max payout: up to 1000× (High risk, 16 rows).",
                ],
            },
        ],
    },
    "andar-bahar": {
        intro:
            "[ANDAR BAHAR] is a classic card game. A single joker card is revealed, then cards are dealt alternately to two sides — Andar and Bahar — until a card matching the joker's rank appears. Bet on which side the match will land.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Set your bet amount (min PKR 10, max PKR 20,000).",
                    "2. Pick a side: Andar or Bahar.",
                    "3. Press Deal. The joker is revealed and cards flip onto each side.",
                    "4. You win if the first card matching the joker's rank lands on your side.",
                ],
            },
            {
                title: "III. Payouts",
                items: [
                    "Win Chance: ~50% — it's an even-money bet.",
                    "Payout Multiplier: fixed 1.96×.",
                    "House Edge: 2%.",
                    "Example: Bet PKR 100 on Andar → win PKR 96 profit (receive PKR 196).",
                ],
            },
        ],
    },
    "dragon-tower": {
        intro:
            "[DRAGON TOWER] is a provably fair climbing game. Scale a tower one row at a time — each row hides safe eggs and hidden dragons. Pick an egg to climb higher and compound your multiplier; pick a dragon and the run ends. Cash out any time.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Set your bet and choose a difficulty (more dragons per row = bigger multipliers).",
                    "2. Press Bet to build the tower — your bet is deducted immediately.",
                    "3. Pick one tile per row, climbing from the bottom up.",
                    "4. An egg is safe and raises your multiplier; a dragon ends the round.",
                    "5. Press Cash Out any time to collect, or reach the top for the max.",
                ],
            },
            {
                title: "III. Payouts",
                items: [
                    "Multiplier compounds per row: ((1 − 0.01) / p) per cleared row, where p = safe ÷ tiles.",
                    "House edge: 1% baked into each row's multiplier.",
                    "Easy ≈ 1.32×/row · Medium ≈ 1.49× · Hard ≈ 1.98× · Expert ≈ 2.97× · Master ≈ 3.96×.",
                    "Payouts are capped at 2000×; reaching the cap auto-collects your win.",
                    "Outcomes are provably fair from a server seed committed before the round.",
                ],
            },
        ],
    },
    "hi-lo": {
        intro:
            "[HI-LO] is a card prediction game. A card is revealed — guess whether the next card will be Higher or Lower. Each correct guess compounds your multiplier. Cash out any time to collect.",
        sections: [
            {
                title: "II. How to Play",
                items: [
                    "1. Set your bet amount (min PKR 10, max PKR 20,000).",
                    "2. Click Higher or Lower to start — your bet is deducted immediately.",
                    "3. Each correct guess compounds your multiplier.",
                    "4. A wrong guess (including ties) ends the round and loses your bet.",
                    "5. Press Cash Out at any point after a win to collect your payout.",
                ],
            },
            {
                title: "III. Payouts",
                items: [
                    "Multiplier = product of each draw's slice: (1 − 0.01) / (winning cards / 13).",
                    "House Edge: 1% per draw.",
                    "Ties always count as a loss.",
                    "Example: Higher on a 7 → 6 winning ranks → 1.65× per draw.",
                    "Example: 3 correct guesses each at 1.65× → 4.49× total payout.",
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

export default function GamesWrapper({
    children,
    balance,
    name,
    subtitle = "1.96× Payout",
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

    const [mt, setMt] = useState<MobileTransform | null>(null);
    const [modal, setModal] = useState<ModalType>(null);
    const [moreOpen, setMoreOpen] = useState(false);
    const [records, setRecords] = useState<BetRecord[]>([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [depositOpen, setDepositOpen] = useState(false);
    const [showPlayingWarn, setShowPlayingWarn] = useState(false);
    const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const isFullscreenRef = useRef(false);
    const gamesWithoutFSRef = useRef(0);
    const prevPlayingRef = useRef(false);
    // Set when user explicitly dismisses the nudge — cleared on lobby return (unmount)
    const fsWarnDeclinedRef = useRef(false);

    const [isOffline, setIsOffline] = useState(false);

    // ── Sound settings ───────────────────────────────────────────────────────────
    const [soundCfg, setSoundCfg] = useState<SoundSettings>(() => getSoundSettings());
    const handleSoundChange = useCallback((key: keyof SoundSettings, val: number) => {
        setSoundCfg(setSoundSettings({ [key]: val }));
    }, []);

    // ── Mobile header ref + measured height ─────────────────────────────────────
    const mobileHeaderRef = useRef<HTMLElement>(null);
    const [mobileHeaderH, setMobileHeaderH] = useState(60);

    // Fullscreen is requested by the LOBBY when the game is opened (see openGame
    // in lobby-inner.tsx). The mount-time requestFullscreen() that used to live
    // here had no user gesture behind it, so browsers rejected it every time and
    // these games never actually went fullscreen. The "Better in Fullscreen"
    // prompt below is the recovery path for sessions that started windowed.

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

    // ── Show fullscreen nudge after FS_WARN_AFTER rounds outside fullscreen ──────
    // Suppressed once the user dismisses it (declined flag) and for a cooldown
    // window after that (snooze), so it never nags round-after-round.
    useEffect(() => {
        const wasPlaying = prevPlayingRef.current;
        prevPlayingRef.current = isPlaying;
        // Never show on browsers that don't support fullscreen (e.g. iOS Safari)
        if (!document.documentElement.requestFullscreen) return;
        if (wasPlaying && !isPlaying && !isFullscreenRef.current) {
            gamesWithoutFSRef.current += 1;
            if (
                gamesWithoutFSRef.current >= FS_WARN_AFTER &&
                !fsWarnDeclinedRef.current &&
                !isFsWarnSnoozed()
            ) {
                stopAutoPlay?.();
                setModal("fullscreen");
            }
        }
    }, [isPlaying, stopAutoPlay]);

    // ── Mobile scale ────────────────────────────────────────────────────────────
    useEffect(() => {
        const update = () => {
            if (window.innerWidth >= 1024) {
                setMt(null);
            } else {
                const scale = window.innerWidth / DESIGN_W;
                setMt({ scale, designHeight: window.innerHeight / scale });
            }
        };
        update();
        window.addEventListener("resize", update);
        // fullscreenchange doesn't always trigger resize on all mobile browsers
        document.addEventListener("fullscreenchange", update);
        return () => {
            window.removeEventListener("resize", update);
            document.removeEventListener("fullscreenchange", update);
        };
    }, []);

    // ── Measure mobile header height after each layout ───────────────────────────
    useLayoutEffect(() => {
        if (mt !== null && mobileHeaderRef.current) {
            const h = mobileHeaderRef.current.getBoundingClientRect().height;
            setMobileHeaderH(Math.ceil(h));
        }
    }, [mt]);

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

    // ── Stop autoplay when user switches away (phone call, another app, etc.) ──
    useEffect(() => {
        const onVisibility = () => {
            if (document.hidden && (autoPlay || isPlaying)) stopAutoPlay?.();
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [autoPlay, isPlaying, stopAutoPlay]);

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

    // True whenever the user must not navigate or deposit (round in flight OR auto-play mode on)
    const isLocked = isPlaying || autoPlay;

    // Close the more-dropdown immediately when controls become locked
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

    const handleDeposit = useCallback(() => {
        if (isPlaying) { warnPlaying(); return; }
        if (autoPlay) return;
        setDepositOpen(true);
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

    // ── Fullscreen warning modal ─────────────────────────────────────────────────
    const fullscreenModal = (
        <GameModal
            open={modal === "fullscreen"}
            onClose={() => { fsWarnDeclinedRef.current = true; snoozeFsWarn(); setModal(null); }}
            variant="reminder"
            title="Better in Fullscreen"
        >
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
                    onClick={() => {
                        document.documentElement.requestFullscreen?.().catch(() => { });
                        setModal(null);
                    }}
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

    // ── Reminder modal ────────────────────────────────────────────────────────────
    const reminderModal = (
        <GameModal
            open={modal === "reminder"}
            onClose={() => setModal(null)}
            variant="reminder"
            title="Leave Game?"
        >
            <p className="mb-5 text-center text-[13px] leading-relaxed text-white/50">
                You can deposit from the lobby without losing your session.
                <br />
                <span className="mt-1.5 block font-bp-mono text-[13px] font-bold text-bp-accent">
                    PKR {fmtPKR(balance)}
                </span>
                <span className="text-[11px]">current balance</span>
            </p>
            <div className="flex flex-col gap-2.5">
                <button
                    onClick={() => { setModal(null); setDepositOpen(true); }}
                    className="w-full rounded-2xl bg-gradient-to-b from-bp-accent to-[#c97e08] py-3 text-[14px] font-black uppercase tracking-wider text-[#1b1305] shadow-[0_2px_12px_rgba(242,154,11,0.4)] transition-all hover:opacity-95"
                >
                    Deposit Now
                </button>
                <button
                    onClick={returnToLobby}
                    className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] py-3 text-[14px] font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white"
                >
                    Return to Lobby
                </button>
                <button
                    onClick={() => setModal(null)}
                    className="w-full py-2 text-[12px] text-white/30 transition-colors hover:text-white/50"
                >
                    Continue Playing
                </button>
            </div>
        </GameModal>
    );

    // ── Rules modal ───────────────────────────────────────────────────────────────
    const rulesModal = (
        <GameModal
            open={modal === "rules"}
            onClose={() => setModal(null)}
            variant="info"
            title="Rules"
        >
            <div className="space-y-5 bg-bp-bg p-4 text-[13px] leading-relaxed text-white/70">
                <div>
                    <p className="mb-2 border-l-2 border-bp-accent pl-2.5 text-[11px] font-bold uppercase tracking-wider text-bp-accent">
                        I. Game Introduction
                    </p>
                    <p>{rules.intro}</p>
                </div>

                {rules.sections.map((section) => (
                    <div key={section.title}>
                        <p className="mb-2 border-l-2 border-bp-accent pl-2.5 text-[11px] font-bold uppercase tracking-wider text-bp-accent">
                            {section.title}
                        </p>
                        <div className="space-y-2">
                            {section.items.map((item, i) => (
                                <p key={i}>{item}</p>
                            ))}
                        </div>
                    </div>
                ))}

                <p className="border-t border-white/[0.06] pt-3 text-[11px] text-white/30">
                    All outcomes are provably fair and cryptographically verifiable.
                </p>
            </div>
        </GameModal>
    );

    // ── Records modal ─────────────────────────────────────────────────────────────
    const recordsModal = (
        <GameModal
            open={modal === "records"}
            onClose={() => setModal(null)}
            variant="info"
            title="Bet Records"
        >
            <div className="bg-bp-bg">
                {/* Summary bar — only shown when there are records */}
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

                {/* Column headers */}
                <div className="grid grid-cols-[1.3fr_0.9fr_0.7fr_1fr] border-b border-white/[0.06] bg-bp-mid px-4 py-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">
                    <span>Time</span>
                    <span className="text-center">Bet</span>
                    <span className="text-center">Mult</span>
                    <span className="text-right">Profit</span>
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
                                        {new Date(r.created_at).toLocaleTimeString("en-PK", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            second: "2-digit",
                                            hour12: false,
                                        })}
                                    </span>
                                    <span className="text-center font-bp-mono text-white/55">
                                        {amt.toFixed(0)}
                                    </span>
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

    // ── Sound settings modal ─────────────────────────────────────────────────────
    const soundsModal = (
        <GameModal
            open={modal === "sounds"}
            onClose={() => setModal(null)}
            variant="info"
            title="Sound Settings"
        >
            <div className="space-y-6 bg-bp-bg p-5">
                {(
                    [
                        { key: "sfx" as const, label: "SFX / Buttons", sub: "Button clicks & game action sounds" },
                        { key: "bgMusic" as const, label: "Background Music", sub: "Ambient loop while in-game" },
                    ] as const
                ).map(({ key, label, sub }) => (
                    <div key={key}>
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <div className="text-[13px] font-semibold text-white/80">{label}</div>
                                <div className="mt-0.5 text-[11px] text-white/35">{sub}</div>
                            </div>
                            <span className="font-bp-mono text-[14px] font-bold text-bp-accent">
                                {Math.round(soundCfg[key] * 100)}%
                            </span>
                        </div>
                        <div className="relative flex items-center gap-3">
                            <span className="w-5 text-center text-[10px] text-white/25">Off</span>
                            <div className="relative flex-1 py-2">
                                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-bp-accent/50 to-bp-accent transition-[width]"
                                        style={{ width: `${soundCfg[key] * 100}%` }}
                                    />
                                </div>
                                <input
                                    type="range"
                                    min={0} max={1} step={0.01}
                                    value={soundCfg[key]}
                                    onChange={(e) => handleSoundChange(key, parseFloat(e.target.value))}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                />
                                <div
                                    className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 bg-[radial-gradient(circle_at_35%_30%,#fff_0%,#f29a0b_80%)] shadow-[0_2px_10px_rgba(242,154,11,0.6)]"
                                    style={{ left: `${soundCfg[key] * 100}%` }}
                                />
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

    // ── Desktop header (lives inside the normal layout flow) ────────────────────
    const desktopHeader = (
        <header
            className="flex flex-shrink-0 items-center justify-between border-b border-white/5 bg-black/25 pb-2.5 pl-3 pr-3"
            style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
        >
            <div className="flex items-center gap-2.5">
                <button
                    onClick={handleBack}
                    disabled={isLocked}
                    className={`flex md:px-3 md:py-2 px-2 py-2 flex-shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isLocked ? "" : "text-[#c4bde0] hover:text-white"}`}
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div>
                    <div className="text-[18px] font-black leading-none tracking-tight text-bp-text">
                        {name}
                    </div>
                    <div style={{
                        lineHeight: "8px"
                    }} className="mt-0.5 text-[10px] uppercase tracking-[3px] text-white/35">
                        {subtitle}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={handleDeposit}
                    disabled={isLocked}
                    className="flex items-center gap-1.5 rounded-xl border border-bp-accent/30 bg-bp-accent/10 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-bp-accent transition-colors hover:bg-bp-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    Deposit
                </button>

                <button
                    onClick={() => setMoreOpen((v) => !v)}
                    disabled={isLocked}
                    className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${moreOpen
                        ? "border-white/20 bg-white/10 text-white"
                        : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white"
                        }`}
                >
                    <MoreVertical className="h-4 w-4" />
                </button>

                <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[2px] text-white/40">Balance</div>
                    <div className="font-bp-mono text-[15px] font-bold leading-none text-bp-text">
                        <span className="mr-1 text-[9px] text-white/40">PKR</span>
                        {fmtPKR(balance)}
                    </div>
                </div>
            </div>
        </header>
    );

    // ── Offline toast ─────────────────────────────────────────────────────────────
    const offlineToast = isOffline && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-[65] flex justify-center px-4">
            <div className="flex items-center gap-2 rounded-2xl border border-red-500/40 bg-black/90 px-5 py-2.5 text-[13px] font-bold text-red-400 shadow-[0_4px_20px_rgba(0,0,0,0.7)] backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                No connection — autoplay stopped
            </div>
        </div>
    );

    // ── Desktop playing toast ────────────────────────────────────────────────────
    const desktopPlayingToast = showPlayingWarn && (
        <div className="pointer-events-none absolute left-0 right-0 top-[64px] z-[60] flex justify-center">
            <div className="rounded-2xl border border-bp-accent/30 bg-black/85 px-5 py-2.5 text-[13px] font-bold text-bp-accent shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-sm">
                Round in progress — wait for result
            </div>
        </div>
    );

    // ── Desktop more dropdown ────────────────────────────────────────────────────
    const desktopMoreDropdown = moreOpen && (
        <>
            <div className="absolute inset-0 z-[40]" onClick={() => setMoreOpen(false)} />
            <div className="absolute right-3 top-[62px] z-[50] min-w-[148px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0c1a] shadow-[0_8px_32px_rgba(0,0,0,0.65)]">
                <button
                    onClick={openRecords}
                    className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                    <History className="h-4 w-4 text-bp-accent" />
                    Records
                </button>
                <div className="mx-3 border-t border-white/[0.06]" />
                <button
                    onClick={() => { setMoreOpen(false); setModal("rules"); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                    <BookOpen className="h-4 w-4 text-bp-accent" />
                    Rules
                </button>
                <div className="mx-3 border-t border-white/[0.06]" />
                <button
                    onClick={() => { setMoreOpen(false); setModal("sounds"); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                    <Volume2 className="h-4 w-4 text-bp-accent" />
                    Sounds
                </button>
            </div>
        </>
    );

    // ── Mobile playing toast (no header inside canvas, so top-0 offset) ─────────
    const mobilePlayingToast = showPlayingWarn && (
        <div className="pointer-events-none absolute left-0 right-0 top-3 z-[60] flex justify-center">
            <div className="rounded-2xl border border-bp-accent/30 bg-black/85 px-5 py-2.5 text-[13px] font-bold text-bp-accent shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-sm">
                Round in progress — wait for result
            </div>
        </div>
    );

    // ── Mobile more dropdown (outside scaled canvas, in physical pixels) ─────────
    const mobileMoreDropdown = moreOpen && (
        <>
            <div className="absolute inset-0 z-[80]" onClick={() => setMoreOpen(false)} />
            <div
                className="absolute right-4 z-[90] min-w-[176px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0c1a] shadow-[0_8px_32px_rgba(0,0,0,0.65)]"
                style={{ top: mobileHeaderH + 8 }}
            >
                <button
                    onClick={openRecords}
                    className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                    <History className="h-4 w-4 text-bp-accent" />
                    Records
                </button>
                <div className="mx-3 border-t border-white/[0.06]" />
                <button
                    onClick={() => { setMoreOpen(false); setModal("sounds"); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                    <Volume2 className="h-4 w-4 text-bp-accent" />
                    Sounds
                </button>
                <div className="mx-3 border-t border-white/[0.06]" />
                <button
                    onClick={() => { setMoreOpen(false); setModal("rules"); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                    <BookOpen className="h-4 w-4 text-bp-accent" />
                    Rules
                </button>
            </div>
        </>
    );

    /* ── Mobile: header at physical pixels, game canvas scaled below it ── */
    if (mt !== null) {
        // Canvas design height = physical space below header / scale
        const canvasDesignH = mt.designHeight - mobileHeaderH / mt.scale;

        return (
            <div
                className="relative h-[100dvh] w-screen overflow-hidden bg-bp-bg select-none"
                style={{ touchAction: "pan-x pan-y", WebkitTapHighlightColor: "transparent", overscrollBehavior: "none" }}
                onContextMenu={(e) => e.preventDefault()}
            >

                {/* ── Physical-pixel header — NOT inside the scaled canvas ── */}
                <header
                    ref={mobileHeaderRef}
                    className="absolute inset-x-0 top-0 z-[70] flex flex-shrink-0 items-center justify-between border-b border-white/5 bg-black/30 px-4 pb-2 md:pb-3 backdrop-blur-sm"
                    style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
                >
                    {/* Left: back + title */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleBack}
                            disabled={isLocked}
                            className={`flex md:px-3 md:py-2 px-2 py-2 flex-shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isLocked ? "" : "text-[#c4bde0] active:scale-95"}`}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <div>
                            <div className="text-[17px] font-black leading-none tracking-tight text-bp-text">
                                {name}
                            </div>
                            <div className="mt-0.5 hidden whitespace-nowrap text-[10px] uppercase tracking-[2px] text-white/35 min-[380px]:block">
                                {subtitle}
                            </div>
                        </div>
                    </div>

                    {/* Right: Deposit + More + Balance */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDeposit}
                            disabled={isLocked}
                            className="flex items-center gap-1.5 rounded-xl border border-bp-accent/30 bg-bp-accent/10 md:px-3 md:py-2 px-2 py-2 text-[12px] font-bold uppercase tracking-wide text-bp-accent transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <ArrowDownToLine className="h-4 w-4" />
                            <b className="hidden sm:inline-block">Deposit</b>
                        </button>

                        <button
                            onClick={() => setMoreOpen((v) => !v)}
                            disabled={isLocked}
                            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${moreOpen
                                ? "border-white/20 bg-white/10 text-white"
                                : "border-white/[0.08] bg-white/[0.03] text-white/60"
                                }`}
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

                {/* ── Scaled game canvas — starts below physical header ── */}
                <main
                    className="absolute flex flex-col bg-gradient-to-b from-bp-mid to-bp-bg font-bp-ui text-white"
                    style={{
                        width: DESIGN_W,
                        height: canvasDesignH,
                        top: mobileHeaderH,
                        left: `calc(50% - ${DESIGN_W / 2}px)`,
                        transform: `scale(${mt.scale})`,
                        transformOrigin: "top center",
                    }}
                >
                    {mobilePlayingToast}
                    {offlineToast}
                    <div className="flex flex-1 flex-col overflow-hidden">
                        {children}
                    </div>
                </main>

                {/* Mobile dropdown outside the transformed canvas so it keeps real screen sizing */}
                {mobileMoreDropdown}

                {/* Modals outside the scaled canvas — render at physical pixels */}
                {reminderModal}
                {rulesModal}
                {recordsModal}
                {fullscreenModal}
                {soundsModal}

                {/* DepositSheet uses fixed positioning — outside the transformed canvas */}
                <DepositSheet includePaddingBottom={false} open={depositOpen} onClose={async () => { setDepositOpen(false); await onDepositClose?.(); }} />
            </div>
        );
    }

    /* ── Desktop: normal responsive layout ── */
    return (
        <main
            className="relative flex min-h-[100dvh] flex-col bg-gradient-to-b from-bp-mid to-bp-bg font-bp-ui text-white lg:h-[100dvh] select-none"
            style={{ touchAction: "pan-x pan-y", WebkitTapHighlightColor: "transparent", overscrollBehavior: "none" }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {desktopHeader}
            {desktopPlayingToast}
            {offlineToast}
            {desktopMoreDropdown}
            <div className="flex flex-1 flex-col lg:flex-row lg:overflow-hidden">
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
