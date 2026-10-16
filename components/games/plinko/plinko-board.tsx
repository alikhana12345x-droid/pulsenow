"use client";

import React, { useEffect, useRef } from "react";

// Canvas Plinko board. The server decides the path (L/R per row); this renders
// it with physics *feel*: the ball accelerates down each segment, eases sideways
// off every peg, leaves a comet trail, flashes the pegs it strikes, and lands in
// a spark burst colored by the bucket. Pegs also glow around the pointer, so the
// board is alive even between drops. All geometry is stored in 0..1 fractions
// and scaled at draw time, so resize costs nothing.

// Colour a bucket by its multiplier — solid gradient blocks (loss → hot red at
// the centre, breakeven → neutral, big wins → gold / teal at the edges).
function bucketStyle(m: number): string {
  if (m >= 10) return "border-teal-300/40 bg-[linear-gradient(180deg,#5eead4,#159180)] text-[#04211c] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_0_14px_rgba(94,234,212,0.25)]";
  if (m >= 2) return "border-amber-300/40 bg-[linear-gradient(180deg,#f8b322,#c47a06)] text-[#1b1305] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_0_12px_rgba(242,154,11,0.22)]";
  if (m > 1) return "border-amber-200/25 bg-[linear-gradient(180deg,#caa53d,#8a6410)] text-[#1b1305] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]";
  if (m === 1) return "border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.06))] text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]";
  return "border-rose-400/40 bg-[linear-gradient(180deg,#f43f5e,#9f1239)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]";
}

function fmtMult(m: number) {
  return m >= 100 ? `${Math.round(m)}` : m >= 10 ? m.toFixed(0) : m.toFixed(m < 1 ? 1 : 2).replace(/\.00$/, "");
}

function sparkColor(m: number): string {
  if (m >= 2) return "#f8b322";
  if (m > 1) return "#fcd34d";
  if (m === 1) return "#cbd5e1";
  return "#ff5d73";
}

// Fractional peg coordinates (match the DOM bucket row: rows+1 equal columns).
const pegXf = (r: number, c: number, rows: number) => (c - r / 2) / (rows + 1) + 0.5;
const pegYf = (r: number, rows: number) => 0.02 + ((r + 1) / (rows + 1)) * 0.92;

const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
const easeInQuad = (t: number) => t * t;

type Pt = { x: number; y: number };
type Flash = { x: number; y: number; age: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number };

export function PlinkoBoard({
  rows,
  mults,
  path,
  dropToken,
  landedBucket,
  onLanded,
}: {
  rows: number;
  mults: number[];
  path: ("L" | "R")[] | null;
  dropToken: number;
  landedBucket: number | null;
  onLanded?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onLandedRef = useRef(onLanded);
  onLandedRef.current = onLanded;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // All animation state lives in a ref — the render loop mutates it directly.
  const animRef = useRef({
    active: false,
    hold: 0, // ms the ball waits at the spawn point before falling
    seg: 0,
    t: 0,
    pts: [] as Pt[],
    perSeg: [] as number[],
    trail: [] as { x: number; y: number; a: number }[],
    flashes: [] as Flash[],
    sparks: [] as Spark[],
    sparkColor: "#f8b322",
    pointer: { x: -1, y: -1 },
  });

  // Kick off a drop when a new path arrives.
  useEffect(() => {
    if (!path || dropToken === 0) return;
    const a = animRef.current;
    const R = rowsRef.current;
    const colAt = (k: number) => path.slice(0, k).filter((d) => d === "R").length;

    // Spawn INSIDE the canvas, above the top peg — the ball is visible there
    // during the hold beat instead of materialising mid-flight.
    const pts: Pt[] = [{ x: 0.5, y: 0.035 }];
    for (let k = 0; k < R; k++) pts.push({ x: pegXf(k, colAt(k), R), y: pegYf(k, R) - 0.02 });
    const bucket = colAt(R);
    pts.push({ x: (bucket + 0.5) / (R + 1), y: 1.02 });

    a.pts = pts;
    a.hold = 500;
    a.seg = 0;
    a.t = 0;
    a.trail = [];
    a.active = true;
    a.sparkColor = sparkColor(mults[bucket] ?? 1);
    // Per-segment duration shrinks as the ball descends — it gathers speed.
    const base = Math.max(150, Math.min(240, 3200 / R));
    a.perSeg = Array.from({ length: pts.length - 1 }, (_, i) => base * (1 - 0.25 * (i / (pts.length - 1))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropToken]);

  // Continuous render loop — pegs + pointer glow even while idle.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduceMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const resize = () => {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.max(1, W * DPR);
      canvas.height = Math.max(1, H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Pre-rendered peg sprite: white-hot core with a soft cool halo. Stamping a
    // sprite is far cheaper than per-peg shadowBlur and glows much better than
    // flat arcs.
    const pegSprite = document.createElement("canvas");
    pegSprite.width = 64; pegSprite.height = 64;
    const pctx = pegSprite.getContext("2d");
    if (pctx) {
      const g = pctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.22, "rgba(240,244,255,0.95)");
      g.addColorStop(0.4, "rgba(190,205,255,0.32)");
      g.addColorStop(1, "rgba(150,170,255,0)");
      pctx.fillStyle = g;
      pctx.fillRect(0, 0, 64, 64);
    }

    const a = animRef.current;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      a.pointer.x = e.clientX - rect.left;
      a.pointer.y = e.clientY - rect.top;
    };
    const onLeave = () => { a.pointer.x = -1; a.pointer.y = -1; };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(now - last, 40); // ms
      last = now;
      const R = rowsRef.current;
      ctx.clearRect(0, 0, W, H);

      // Ball position for this frame (advance segments; fire events on crossings)
      let ballX = -1, ballY = -1;
      if (a.active && a.hold > 0) {
        // Hold beat: the ball sits at the spawn point before gravity takes it.
        a.hold -= dt;
        ballX = a.pts[0].x * W;
        ballY = a.pts[0].y * H;
      } else if (a.active) {
        a.t += dt;
        while (a.active && a.t >= a.perSeg[a.seg]) {
          a.t -= a.perSeg[a.seg];
          // Segment k ends at peg row k (last segment ends in the bucket).
          if (a.seg < R) {
            const hit = a.pts[a.seg + 1];
            a.flashes.push({ x: hit.x, y: hit.y + 0.02, age: 0 });
          }
          a.seg += 1;
          if (a.seg >= a.perSeg.length) {
            a.active = false;
            const land = a.pts[a.pts.length - 1];
            if (!reduceMotion) {
              for (let i = 0; i < 16; i++) {
                a.sparks.push({
                  x: land.x * W, y: H - 2,
                  vx: (Math.random() - 0.5) * 220,
                  vy: -(Math.random() * 260 + 60),
                  life: 1,
                });
              }
            }
            onLandedRef.current?.();
          }
        }
        if (a.active) {
          const tt = a.t / a.perSeg[a.seg];
          const p0 = a.pts[a.seg], p1 = a.pts[a.seg + 1];
          ballX = (p0.x + (p1.x - p0.x) * easeOutQuad(tt)) * W;
          ballY = (p0.y + (p1.y - p0.y) * easeInQuad(tt)) * H;
          if (!reduceMotion) {
            a.trail.push({ x: ballX, y: ballY, a: 0.5 });
            if (a.trail.length > 14) a.trail.shift();
          }
        }
      }

      // ── Pegs (glow sprite + crisp core, pointer proximity brightens) ──
      const pr = Math.max(2.5, Math.min(4, W / 180));
      for (let r = 0; r < R; r++) {
        for (let c = 0; c <= r; c++) {
          const x = pegXf(r, c, R) * W;
          const y = pegYf(r, R) * H;
          let alpha = 0.7;
          let rad = pr;
          if (a.pointer.x >= 0) {
            const d = Math.hypot(a.pointer.x - x, a.pointer.y - y);
            if (d < 56) { const k = 1 - d / 56; alpha += k * 0.3; rad += k * 1.2; }
          }
          const size = rad * 7;
          ctx.globalAlpha = Math.min(1, alpha);
          ctx.drawImage(pegSprite, x - size / 2, y - size / 2, size, size);
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(x, y, rad * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // ── Peg hit flashes: bright core + expanding ring ──
      for (let i = a.flashes.length - 1; i >= 0; i--) {
        const f = a.flashes[i];
        f.age += dt;
        const k = f.age / 340;
        if (k >= 1) { a.flashes.splice(i, 1); continue; }
        const x = f.x * W, y = f.y * H;
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.fillStyle = "#ffd98a";
        ctx.beginPath();
        ctx.arc(x, y, pr + 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = (1 - k) * 0.55;
        ctx.strokeStyle = "#f8b322";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 3 + k * 17, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // ── Trail ──
      for (const tr of a.trail) {
        tr.a *= 0.86;
        ctx.globalAlpha = tr.a;
        ctx.fillStyle = "#f8b322";
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── Ball ──
      if (ballX >= 0) {
        ctx.shadowColor = "rgba(242,154,11,0.95)";
        ctx.shadowBlur = 16;
        const g = ctx.createRadialGradient(ballX - 2, ballY - 2.5, 1, ballX, ballY, 7.5);
        g.addColorStop(0, "#fff7e0");
        g.addColorStop(0.45, "#f8b322");
        g.addColorStop(1, "#c97e08");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ballX, ballY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ── Landing sparks ──
      for (let i = a.sparks.length - 1; i >= 0; i--) {
        const s = a.sparks[i];
        s.life -= dt / 620;
        if (s.life <= 0) { a.sparks.splice(i, 1); continue; }
        s.x += (s.vx * dt) / 1000;
        s.y += (s.vy * dt) / 1000;
        s.vy += (620 * dt) / 1000; // gravity
        ctx.globalAlpha = s.life * 0.9;
        ctx.fillStyle = a.sparkColor;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <style>{`
        @keyframes plk-land { 0% { transform: scale(1) } 40% { transform: scale(1.22) translateY(-3px) } 100% { transform: scale(1) } }
      `}</style>

      {/* Peg field (canvas) */}
      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      </div>

      {/* Buckets — no gap/padding so each cell is exactly 1/(rows+1) of the width and
          its centre lines up with the ball's landing x = (bucket+0.5)/(rows+1). */}
      <div className="flex w-full pb-0.5">
        {mults.map((m, i) => {
          const isLanded = landedBucket === i;
          return (
            <div
              key={i}
              className={`mx-[1.5px] flex flex-1 items-center justify-center rounded-md border py-2 font-bp-mono text-[10px] font-black tabular-nums transition-all sm:text-[12px] ${bucketStyle(m)} ${isLanded ? "z-10 ring-2 ring-white/80" : ""}`}
              style={{ minWidth: 0, ...(isLanded ? { animation: "plk-land .45s cubic-bezier(.2,1.6,.4,1)" } : null) }}
            >
              {fmtMult(m)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
