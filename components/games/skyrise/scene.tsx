"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoundPhase } from "./types";

// ── Maths ─────────────────────────────────────────────────────────────────────

export function curveProgress(multiplier: number) {
  const raw = Math.log(Math.max(1.0001, multiplier)) / Math.log(50);
  return Math.min(1, Math.max(0, Math.sqrt(raw)));
}

export function curvePoint(t: number) {
  return {
    x: Math.pow(t, 1.55),
    y: 1 - Math.pow(t, 0.64) * 0.9,
  };
}

function tangentAngle(t: number, scaleX: number, scaleY: number) {
  const eps = 0.001;
  const a = curvePoint(Math.max(0, t - eps));
  const b = curvePoint(Math.min(1, t + eps));
  return (Math.atan2((b.y - a.y) * scaleY, (b.x - a.x) * scaleX) * 180) / Math.PI;
}

function multiplierColor(phase: RoundPhase) {
  if (phase === "crash") return { text: "#ff4455", glow: "rgba(255,68,85,0.9)" };
  return { text: "#ffffff", glow: "rgba(255,255,255,0.38)" };
}

// ── StarGridScene — Aviator-style dark purple sunburst with milestone flashes ──

export function StarGridScene({
  phase,
  multiplier,
}: {
  phase: RoundPhase;
  multiplier: number;
}) {
  // Aviator-style rays: faint grey wedges on near-black, radiating from the
  // launch corner (bottom-left) and rotating very slowly. HARD gradient stops
  // (same technique as the between-round loader screen) — soft fade ramps on
  // the wedge edges are what made the scene look blurry/smudged in flight.
  const rayGradient =
    "repeating-conic-gradient(from 0deg at 50% 50%, rgba(178,188,202,0.09) 0deg 4.5deg, rgba(178,188,202,0) 4.5deg 10deg)";

  // Dynamic glow intensity — grows with multiplier during flight
  const glowIntensity = useMemo(() => {
    if (phase !== "flight" && phase !== "crash") return 0;
    return Math.min(1, Math.log(Math.max(1.0001, multiplier)) / Math.log(20));
  }, [phase, multiplier]);

  // The official scene's signature: the centre glow SHIFTS HUE as the
  // multiplier climbs. Rotates ~30° per 1.0× gained so every x milestone lands
  // on a visibly different colour — blue at launch, violet ~3×, pink ~5×,
  // red ~6×, then onward around the wheel on long flights.
  const glowHue = useMemo(
    () => (205 + (Math.min(multiplier, 100) - 1) * 30) % 360,
    [multiplier],
  );
  const flying = phase === "flight" || phase === "crash" || phase === "post";
  // Bright enough to clearly glow, but capped below the point where the stage
  // washes out and the red curve loses contrast against the background.
  const glowA = flying ? 0.2 + 0.16 * glowIntensity : 0.09;

  // Milestone flash: triggers on each integer multiplier crossing during flight
  const [flashKey, setFlashKey] = useState(0);
  const lastMilestone = useRef(1);

  useEffect(() => {
    if (phase !== "flight") { lastMilestone.current = 1; return; }
    const m = Math.floor(multiplier);
    if (m > lastMilestone.current) {
      lastMilestone.current = m;
      setFlashKey((k) => k + 1);
    }
  }, [multiplier, phase]);

  const showCrash = phase === "crash" || phase === "post";

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#08090b]">
      <style>{`
        @keyframes sg-milestone { 0%{opacity:0.72} 100%{opacity:0} }
        @keyframes sg-crash     { 0%{opacity:0.55} 50%{opacity:0.35} 100%{opacity:0} }
        @keyframes sg-rays      { from { transform: translate(-50%,-50%) rotate(0deg) } to { transform: translate(-50%,-50%) rotate(360deg) } }
      `}</style>
      {/* Base vignette — near-black like the official scene */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 90% 90% at 35% 60%, #101317 0%, #08090b 60%, #050607 100%)" }} />
      {/* Sunburst rays — anchored at the launch corner, rotating slowly */}
      <div
        className="absolute"
        style={{
          left: "8%",
          top: "96%",
          width: "300vmax",
          height: "300vmax",
          transform: "translate(-50%,-50%)",
          background: rayGradient,
          opacity: 0.7 + 0.3 * glowIntensity,
          animation: "sg-rays 90s linear infinite",
        }}
      />
      {/* Central glow — bright, hue shifts blue → violet → pink with the multiplier */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 74% 64% at 50% 45%, hsla(${glowHue.toFixed(0)},80%,48%,${glowA.toFixed(3)}) 0%, hsla(${glowHue.toFixed(0)},72%,30%,${(glowA * 0.45).toFixed(3)}) 46%, transparent 74%)`,
        }}
      />
      {/* Horizon glow — follows the same hue */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 110% 26% at 50% 100%, hsla(${glowHue.toFixed(0)},72%,30%,${(0.1 + 0.16 * glowIntensity).toFixed(3)}) 0%, transparent 68%)`,
        }}
      />
      {/* Multiplier milestone pulse — keyed so it replays on every new milestone */}
      {flashKey > 0 && (
        <div
          key={flashKey}
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 90% 65% at 50% 50%, hsla(${glowHue.toFixed(0)},85%,62%,0.22) 0%, transparent 70%)`,
            animation: "sg-milestone 0.6s ease-out forwards",
          }}
        />
      )}
      {/* Crash red overlay */}
      {showCrash && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 110% 85% at 50% 55%, rgba(200,0,30,0.22) 0%, transparent 80%)",
            animation: "sg-crash 2s ease-out forwards",
          }}
        />
      )}
    </div>
  );
}

// ── FlightCurve ───────────────────────────────────────────────────────────────

export type CashoutTarget = { id: "A" | "B"; multiplier: number };

export function FlightCurve({
  phase,
  multiplier,
  width,
  height,
  cashoutTargets = [],
}: {
  phase: RoundPhase;
  multiplier: number;
  crashAt: number;
  width: number;
  height: number;
  cashoutTargets?: CashoutTarget[];
}) {
  const padLeft = 24;
  const padRight = 18;
  const padTop = 30;
  const padBottom = 26;
  const innerW = Math.max(1, width - padLeft - padRight);
  const innerH = Math.max(1, height - padTop - padBottom);

  const progress = (phase === "betting" || phase === "loading") ? 0 : curveProgress(multiplier);

  const allPoints = useMemo(() => {
    return Array.from({ length: 100 }, (_, i) => {
      const t = i / 99;
      const p = curvePoint(t);
      return { t, x: padLeft + p.x * innerW, y: padTop + p.y * innerH };
    });
  }, [innerW, innerH]);

  const activePoints = allPoints.filter((pt) => pt.t <= progress + 0.001);
  if (activePoints.length === 0 || activePoints[activePoints.length - 1].t !== progress) {
    const p = curvePoint(progress);
    activePoints.push({ t: progress, x: padLeft + p.x * innerW, y: padTop + p.y * innerH });
  }

  const tip = activePoints[activePoints.length - 1] ?? { x: padLeft, y: padTop + innerH };
  // Angle in screen-space (accounts for stage aspect ratio) — clamp to prevent nose-diving straight down
  const angle = Math.max(-5, tangentAngle(progress, innerW, innerH));
  const isCrash = phase === "crash";

  const linePath =
    activePoints.length > 1
      ? `M ${activePoints.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}`
      : "";

  const fillPath =
    activePoints.length > 1
      ? `M ${padLeft} ${padTop + innerH} L ${activePoints.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} L ${tip.x.toFixed(1)} ${padTop + innerH} Z`
      : "";

  // Auto-cashout target lines
  const targetLines = cashoutTargets
    .filter((t) => t.multiplier > Math.max(1.01, multiplier) && t.multiplier <= 100)
    .map((t) => {
      const p = curvePoint(curveProgress(t.multiplier));
      return { ...t, yPx: padTop + p.y * innerH };
    })
    .filter((t) => t.yPx > padTop && t.yPx < padTop + innerH);

  const [shake, setShake] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (phase !== "crash") { setShake({ x: 0, y: 0 }); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      if (elapsed > 0.6) { setShake({ x: 0, y: 0 }); return; }
      const power = 1 - elapsed / 0.6;
      setShake({ x: (Math.random() * 2 - 1) * 6 * power, y: (Math.random() * 2 - 1) * 6 * power });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Fly-away animation — on crash the plane continues along its trajectory off screen
  const [flyAway, setFlyAway] = useState<{ tx: number; ty: number; opacity: number } | null>(null);

  useEffect(() => {
    // Keep flyAway alive during "post" so the plane stays visible after the
    // crash→post transition (which fires at 1400 ms, before the animation ends).
    if (phase === "post") return;
    if (phase !== "crash") { setFlyAway(null); return; }
    const crashAngle = angle; // capture once at crash start
    const rad = (crashAngle * Math.PI) / 180;
    const startTime = performance.now();
    const speed = 300;  // SVG px/s — slower for a more cinematic exit
    const duration = 1200; // ms — ~1 s longer than before
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const frac = Math.min(1, elapsed / duration);
      const dist = speed * (elapsed / 1000);
      // Fade gently over the full duration (no * 1.4 multiplier)
      setFlyAway({ tx: Math.cos(rad) * dist, ty: Math.sin(rad) * dist, opacity: Math.max(0, 1 - frac) });
      if (frac < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Animated plane — cycles through 4 SVG frames at ~9 fps for wing-flap effect
  const [planeFrame, setPlaneFrame] = useState(1);
  useEffect(() => {
    if (phase !== "flight" && phase !== "crash") { setPlaneFrame(1); return; }
    const id = setInterval(() => setPlaneFrame((f) => (f % 4) + 1), 110);
    return () => clearInterval(id);
  }, [phase]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full pointer-events-none"
      style={{ transform: `translate(${shake.x}px, ${shake.y}px)` }}
    >
      <style>{`@keyframes planeBob { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-5px)} }`}</style>
      <defs>
        {/* Aviator-style fill: vivid saturated red right under the line,
            easing to a slightly deeper red at the base — never near-black,
            which is what made the old fill read as a murky shadow. */}
        <linearGradient id="aFlyFill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#8e0225" />
          <stop offset="100%" stopColor="#e50539" />
        </linearGradient>
        <linearGradient id="aCrashFill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#8e0225" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#e50539" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      {fillPath && (
        <path d={fillPath} fill={isCrash ? "url(#aCrashFill)" : "url(#aFlyFill)"} />
      )}

      {/* Curve line — solid bright red so it stays crisp on top of the fill */}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="#ff3560"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={isCrash ? 0.7 : 1}
        />
      )}

      {/* Auto-cashout target lines */}
      {targetLines.map((t) => {
        const clr = t.id === "A" ? "#38bdf8" : "#a78bfa";
        const bg = t.id === "A" ? "rgba(56,189,248,0.12)" : "rgba(167,139,250,0.12)";
        const bdr = t.id === "A" ? "rgba(56,189,248,0.40)" : "rgba(167,139,250,0.40)";
        return (
          <g key={t.id}>
            <line
              x1={padLeft} x2={width - padRight - 46}
              y1={t.yPx} y2={t.yPx}
              stroke={clr} strokeWidth="1.5" strokeDasharray="7 5" opacity="0.65"
            />
            <rect x={width - padRight - 44} y={t.yPx - 9} width="44" height="18" rx="9"
              fill={bg} stroke={bdr} strokeWidth="1" />
            <text
              x={width - padRight - 22} y={t.yPx + 4}
              textAnchor="middle" fill={clr} fontSize="9" fontWeight="900" fontFamily="monospace"
            >
              {t.multiplier.toFixed(2)}×
            </text>
          </g>
        );
      })}

      {/* Plane — flies away off screen on crash instead of exploding */}
      {(phase === "flight" || ((phase === "crash" || phase === "post") && flyAway != null)) && progress > 0.01 && (
        <g
          transform={`translate(${(tip.x + (flyAway?.tx ?? 0)).toFixed(1)}, ${(tip.y + (flyAway?.ty ?? 0)).toFixed(1)}) rotate(${angle.toFixed(1)}) scale(${width < 640 ? 0.6 : 1})`}
          style={{ opacity: flyAway != null ? flyAway.opacity : 1 }}
        >
          <g style={{ animation: phase === "flight" ? "planeBob 1.4s ease-in-out infinite" : "none" }}>
            {/* Plane SVG images — right edge at x=0 so nose sits exactly at curve tip.
                All four frames are mounted with a STATIC href and the flap is done by
                toggling visibility. Swapping the href of a single <image> instead makes
                the browser start a fresh resource load on every frame change (~9/s),
                which showed up as hundreds of plane-*.svg requests per round — a mix of
                200/304/(canceled), since each swap aborts the previous load. With fixed
                hrefs each file is fetched exactly once for the lifetime of the mount. */}
            {[1, 2, 3, 4].map((f) => (
              <image
                key={f}
                href={`/planes/plane-${f}.svg`}
                x="-10" y="-70" width="150" height="74"
                style={{ visibility: f === planeFrame ? "visible" : "hidden" }}
              />
            ))}
          </g>
        </g>
      )}
    </svg>
  );
}

// ── MultiplierReadout ─────────────────────────────────────────────────────────

const ROUND_BETTING_SECONDS = 5;

export function MultiplierReadout({
  phase,
  multiplier,
  crashAt,
  countdown,
}: {
  phase: RoundPhase;
  multiplier: number;
  crashAt: number;
  countdown: number;
}) {
  const { text: color, glow } = multiplierColor(phase);

  if (phase === "betting" || phase === "loading") {
    // Aviator-style between-round screen (1:1 with the reference; texts are
    // placeholders to rebrand later). "loading" renders the SAME screen — the
    // bar just holds with a pulsing sliver until the round response lands, so
    // the flight starts the instant it does with no visible second loader.
    const remainPct = phase === "betting"
      ? Math.max(0, Math.min(100, (countdown / ROUND_BETTING_SECONDS) * 100))
      : 0;
    return (
      <div className="absolute inset-0 pointer-events-none">
        {/* Opaque Aviator backdrop: black with grey sunburst rays covering the
            whole scene (hides the curve/target lines behind it). Badges and
            history chips render later in the DOM, so they stay visible. */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 85% 85% at 50% 50%, #17171a 0%, #0a0a0c 65%, #050506 100%)" }} />
        <div
          className="absolute inset-0"
          style={{
            background: "repeating-conic-gradient(from 8deg at 50% 50%, rgba(255,255,255,0.05) 0deg 11deg, rgba(255,255,255,0) 11deg 25deg)",
            maskImage: "radial-gradient(ellipse 95% 95% at 50% 50%, black 25%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 95% 95% at 50% 50%, black 25%, transparent 80%)",
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-center">
          {/* Brand lockup — placeholder names copied from the reference; swap later */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="font-bp-ui text-[34px] font-black italic leading-none tracking-tight text-[#e50539] sm:text-[46px]"
              style={{ textShadow: "0 2px 14px rgba(0,0,0,0.6)" }}>
              UFC
            </div>
            <div className="h-9 w-[3px] rounded-full bg-white/85 sm:h-11" />
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/planes/plane-1.svg" alt="" className="absolute -right-3 -top-4 h-5 w-auto -rotate-6 sm:-top-5 sm:h-6" />
              <div className="text-[26px] font-black italic leading-none text-[#e50539] sm:text-[34px]"
                style={{ fontFamily: "Georgia,'Times New Roman',serif", textShadow: "0 2px 14px rgba(0,0,0,0.6)" }}>
                Aviator
              </div>
            </div>
          </div>

          <div className="font-bp-ui text-[14px] font-black uppercase tracking-[0.22em] text-white sm:text-[16px]"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}>
            Official Partners
          </div>

          {/* Red drain bar over grey track. One continuous element across
              betting AND loading: it drains to 0 and simply holds there if the
              round response needs an extra beat — no visual restart. */}
          <div className="relative h-[3px] w-44 overflow-hidden rounded-full bg-white/25 sm:w-52">
            <div className="absolute inset-y-0 left-0 bg-[#e50539]" style={{ width: `${remainPct}%` }} />
          </div>

          {/* Provider badge */}
          <div className="mt-2 flex flex-col items-center gap-1 rounded-lg border border-[#4c9f38]/80 bg-black/70 px-4 py-2 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 font-bp-ui text-[12px] font-black tracking-[0.12em] text-white">
              <span className="text-[#8ee06a]">✦</span> SPRIBE
            </div>
            <div className="rounded-full border border-[#57b23c]/70 px-2.5 py-0.5 text-[9px] font-bold text-[#8ee06a]">
              Official Game ✓
            </div>
            <div className="text-[8px] font-semibold text-white/45">Since 2018</div>
          </div>
        </div>

        {/* Parked plane, bottom-left */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/planes/plane-1.svg" alt="" className="absolute bottom-2 left-3 h-8 w-auto sm:h-10" />
      </div>
    );
  }


  if (phase === "crash" || phase === "post") {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-2.5">
          <div className="rounded-full border border-rose-500/40 bg-rose-500/15 px-5 py-1 text-[10px] font-black uppercase tracking-[0.38em] text-rose-400">
            Flew Away
          </div>
          <div
            className="font-mono font-black leading-none"
            style={{ fontSize: 82, color, textShadow: `0 0 28px ${glow}, 0 0 56px ${glow}` }}
          >
            {crashAt.toFixed(2)}×
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="text-center">
        <div
          className="font-mono font-black leading-none transition-none"
          style={{ fontSize: 82, color, textShadow: `0 0 28px ${glow}, 0 0 56px ${glow}` }}
        >
          {multiplier.toFixed(2)}×
        </div>
        <div className="mt-2 text-[9px] font-black uppercase tracking-[0.42em] text-white/30">Flying</div>
      </div>
    </div>
  );
}
