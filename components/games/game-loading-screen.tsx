"use client";

import { useEffect, useState } from "react";

// ─── Per-game config ──────────────────────────────────────────────────────────

// Every game has its own dedicated loader art. The five newest games used to
// borrow another game's image (Plinko showed the Aviator plane, Keno and Limbo
// showed dice, Dragon Tower showed Mines) — that's resolved. All art is 941×1672
// portrait WebP, ~40–155 KB; see scripts/optimize-loading-art.mjs.
const GAME_CONFIG: Record<string, {
  bgImage: string;          // portrait WebP from /brand/loading/
  accent: string;           // progress bar + glow colour
  name: string;
  tagline: string;
}> = {
  "dice-3d": {
    bgImage: "/brand/loading/dice-roll.webp",
    accent:  "#f29a0b",
    name:    "Dice 3D",
    tagline: "Predict the roll. Win up to 9,900×.",
  },
  "skyrise": {
    bgImage: "/brand/loading/sky-rise.webp",
    accent:  "#e0302a",
    name:    "Aviator",
    tagline: "Cash out before it crashes.",
  },
  "coinflip": {
    bgImage: "/brand/loading/coin-flip.webp",
    accent:  "#f29a0b",
    name:    "Coin Flip",
    tagline: "Heads or tails — pure chance.",
  },
  "hi-lo": {
    bgImage: "/brand/loading/cards.webp",
    accent:  "#2dd4bf",
    name:    "Hi-Lo",
    tagline: "Higher or lower — read the deck.",
  },
  "mines": {
    bgImage: "/brand/loading/mines.webp",
    accent:  "#5eead4",
    name:    "Mines",
    tagline: "One wrong step ends it all.",
  },
  "limbo": {
    bgImage: "/brand/loading/limbo.webp",
    accent:  "#22d3ee",
    name:    "Limbo",
    tagline: "Set a target. Let it fly.",
  },
  "dragon-tower": {
    bgImage: "/brand/loading/dragon-tower.webp",
    accent:  "#f97316",
    name:    "Dragon Tower",
    tagline: "Climb high. Dodge the dragons.",
  },
  "andar-bahar": {
    bgImage: "/brand/loading/andar-bahar.webp",
    accent:  "#10b981",
    name:    "Andar Bahar",
    tagline: "Pick a side. Andar or Bahar.",
  },
  "plinko": {
    bgImage: "/brand/loading/plinko.webp",
    accent:  "#a78bfa",
    name:    "Plinko",
    tagline: "Drop the ball. Ride the multiplier.",
  },
  "keno": {
    bgImage: "/brand/loading/keno.webp",
    // Art glow samples at #b279f4 (violet), so the old indigo #6366f1 clashed with
    // the title/progress drawn over it. violet-500 is the closest palette match.
    accent:  "#8b5cf6",
    name:    "Keno",
    tagline: "Pick your numbers. Match the draw.",
  },
  "dragon-tiger": {
    bgImage: "/brand/loading/dragon-tiger.webp",
    accent:  "#f5b60a",
    name:    "Dragon vs Tiger",
    tagline: "One card each. Higher wins.",
  },
  "teen-patti": {
    bgImage: "/brand/loading/teen-patti.webp",
    accent:  "#d4a02c",
    name:    "Teen Patti",
    tagline: "Two hands. Best three cards win.",
  },
};

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress, accent }: { progress: number; accent: string }) {
  return (
    <div className="relative h-[3px] w-52 overflow-hidden rounded-full bg-white/[0.12]">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          background: `linear-gradient(to right, ${accent}88, ${accent})`,
          boxShadow: `0 0 10px ${accent}99`,
        }}
      />
    </div>
  );
}

// ─── GameLoadingScreen ────────────────────────────────────────────────────────
// Drop this anywhere above the Three.js game component.
// Pass `progress` 0–100 from useGameLoader(); screen fades out at 100.

export function GameLoadingScreen({
  gameId,
  progress = 0,
}: {
  gameId: string;
  progress?: number;
}) {
  const [visible, setVisible] = useState(true);
  const cfg = GAME_CONFIG[gameId] ?? GAME_CONFIG["dice-3d"];

  // Fade out 200ms after reaching 100%
  useEffect(() => {
    if (progress >= 100) {
      const t = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(t);
    }
  }, [progress]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{
        opacity: progress >= 100 ? 0 : 1,
        transition: "opacity 350ms ease-out",
        pointerEvents: progress >= 100 ? "none" : "auto",
      }}
    >
      {/* ── Full-bleed background image ── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cfg.bgImage}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      {/* ── Layered overlays for text legibility ──
           Top: dark band for brand mark
           Middle: near-transparent to let art breathe
           Bottom: dark band for progress bar + tagline            */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(
              to bottom,
              rgba(6,4,16,0.80) 0%,
              rgba(6,4,16,0.20) 22%,
              rgba(6,4,16,0.10) 45%,
              rgba(6,4,16,0.35) 72%,
              rgba(6,4,16,0.90) 100%
            )
          `,
        }}
      />

      {/* ── Accent colour atmospheric bloom (centre) ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 35% at 50% 62%, ${cfg.accent}18, transparent 70%)`,
        }}
      />

      {/* ── Top bar — PulseNow brand mark ── */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-center pt-12 pb-4">
        <span
          className="font-bp-mono text-[11px] font-bold uppercase tracking-[0.35em]"
          style={{ color: `${cfg.accent}88` }}
        >
          PulseNow
        </span>
      </div>

      {/* ── Bottom panel — game info + progress ── */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-4 pb-14 pt-6">
        {/* Game name + tagline */}
        <div className="text-center">
          <p
            className="text-[26px] font-black tracking-tight leading-none"
            style={{ color: cfg.accent }}
          >
            {cfg.name}
          </p>
          <p className="mt-1.5 text-[11px] tracking-wide text-white/40">
            {cfg.tagline}
          </p>
        </div>

        {/* Progress bar + percent */}
        <div className="flex flex-col items-center gap-2">
          <ProgressBar progress={progress} accent={cfg.accent} />
          <span className="font-bp-mono text-[10px] text-white/25">
            {progress < 100 ? `${progress}%` : "Ready"}
          </span>
        </div>
      </div>

      {/* ── Provably fair badge (bottom-right) ── */}
      <div className="absolute bottom-5 right-5">
        <span className="font-bp-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/15">
          Provably Fair
        </span>
      </div>
    </div>
  );
}

// ─── useGameLoader ────────────────────────────────────────────────────────────
// Simulates fast load to 85%, stalls until `ready` fires, then completes.
// Wire `ready` to your Three.js scene's onLoad/onReady callback.

export function useGameLoader(ready: boolean = false): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let current = 0;
    let raf: ReturnType<typeof setTimeout>;

    const tick = () => {
      const ceiling = ready ? 100 : 85;
      // Speed curve: fast early, slow near the ceiling
      const speed =
        current < 30 ? 5 :
        current < 60 ? 3 :
        current < 80 ? 1.5 :
        current < 85 ? 0.8 :
        ready ? 2 : 0;       // stall here until ready

      if (speed > 0) {
        current = Math.min(current + speed, ceiling);
        setProgress(Math.round(current));
      }

      if (current < ceiling) {
        raf = setTimeout(tick, 50);
      }
    };

    raf = setTimeout(tick, 80);
    return () => clearTimeout(raf);
  }, [ready]);

  return progress;
}
