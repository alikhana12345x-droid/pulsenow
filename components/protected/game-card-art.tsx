// SVG illustration art for each game card on the lobby page
import Image from "next/image";
import type { FC } from "react";

export function DiceArt() {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Dot-grid texture */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 160" preserveAspectRatio="xMidYMid slice">
        {[0,1,2,3,4,5,6,7].flatMap(row =>
          [0,1,2,3,4,5,6,7,8,9].map(col => (
            <circle key={`${row}-${col}`} cx={col*22+11} cy={row*20+10} r="1.2" fill="rgba(255,255,255,0.09)"/>
          ))
        )}
      </svg>

      {/* Isometric dice */}
      <svg
        viewBox="0 0 140 140"
        width="115"
        height="115"
        className="relative z-10"
        style={{ filter: 'drop-shadow(0 0 28px rgba(167,139,250,0.75)) drop-shadow(0 10px 24px rgba(0,0,0,0.75))' }}
      >
        {/* Top face — lightest */}
        <polygon points="70,8 126,42 70,76 14,42" fill="#ddd6fe"/>
        {/* Right face — darkest */}
        <polygon points="126,42 126,98 70,132 70,76" fill="#5b21b6"/>
        {/* Left face — mid */}
        <polygon points="14,42 70,76 70,132 14,98" fill="#6d28d9"/>
        {/* Edges */}
        <polygon points="70,8 126,42 70,76 14,42" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
        <polygon points="126,42 126,98 70,132 70,76" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5"/>
        <polygon points="14,42 70,76 70,132 14,98" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5"/>
        <line x1="70" y1="76" x2="70" y2="132" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2"/>

        {/* Top face dots — 6 */}
        <circle cx="50" cy="28" r="5.5" fill="#4c1d95"/>
        <circle cx="90" cy="28" r="5.5" fill="#4c1d95"/>
        <circle cx="50" cy="42" r="5.5" fill="#4c1d95"/>
        <circle cx="90" cy="42" r="5.5" fill="#4c1d95"/>
        <circle cx="50" cy="56" r="5.5" fill="#4c1d95"/>
        <circle cx="90" cy="56" r="5.5" fill="#4c1d95"/>

        {/* Right face dots — 3 */}
        <circle cx="109" cy="70" r="4.5" fill="rgba(221,214,254,0.45)"/>
        <circle cx="109" cy="92" r="4.5" fill="rgba(221,214,254,0.45)"/>
        <circle cx="87"  cy="107" r="4.5" fill="rgba(221,214,254,0.45)"/>

        {/* Left face dots — 2 */}
        <circle cx="42" cy="73"  r="4.5" fill="rgba(237,233,254,0.35)"/>
        <circle cx="42" cy="101" r="4.5" fill="rgba(237,233,254,0.35)"/>
      </svg>

      {/* Floating cube accents */}
      <div className="absolute top-4 left-5 w-7 h-7 rounded-[4px] border border-violet-400/25 rotate-12 opacity-35" />
      <div className="absolute bottom-5 right-7 w-5 h-5 rounded-[3px] border border-purple-300/20 opacity-30" style={{ transform: 'rotate(-8deg)' }} />
      <div className="absolute top-8 right-9 w-3.5 h-3.5 rounded-[3px] bg-violet-500/15 rotate-45" />
    </div>
  );
}

export function SkyRiseArt() {
  // A poster of the in-game stage: violet sunburst sky, the red plane climbing
  // on its signature trail, and the big white live multiplier. Matches what
  // players actually see in the round instead of the old all-red look.
  //
  // RESPONSIVENESS — the card box has a FIXED height (h-52 featured, h-36 grid)
  // inside a column that grows from ~288px to 568px wide, so its aspect ratio
  // swings from ~1.39:1 up to ~2.73:1. `slice` scales to cover, so a wide/short
  // viewBox (the old 320×128) got cropped HORIZONTALLY on phones and cut the
  // plane and the multiplier off. The viewBox is therefore tall — 320×232, the
  // narrowest box's aspect — and every focal element (trail tip, plane, readout)
  // sits inside y 60–172: the middle band that still survives at 2.73:1. Sky
  // decor fills the rest and is safe to crop at any size.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  // Ray convergence sits above the climb (not on it — the pinch point reads as
  // a seam if it lands on the trail) and inside the desktop band.
  const CX = 160, CY = 86;
  // Sunburst rays from the stage centre (trig rounded to 2dp → SSR-safe).
  // +7° offset: with rays starting at 0° one edge runs dead horizontal across
  // the whole card and reads as a seam.
  const rays = Array.from({ length: 12 }, (_, k) => {
    const a0 = ((k * 30 + 7) * Math.PI) / 180;
    const a1 = ((k * 30 + 21) * Math.PI) / 180;
    return {
      x0: r2(CX + Math.cos(a0) * 300), y0: r2(CY + Math.sin(a0) * 300),
      x1: r2(CX + Math.cos(a1) * 300), y1: r2(CY + Math.sin(a1) * 300),
    };
  });
  const stars: [number, number, number][] = [
    [30, 26, 1], [70, 52, 0.8], [120, 16, 1.1], [210, 22, 0.9], [268, 38, 1.1],
    [302, 18, 0.8], [296, 104, 1], [44, 100, 0.9], [104, 74, 0.7], [252, 84, 0.9],
    [18, 148, 0.9], [148, 200, 0.8], [286, 168, 1], [232, 212, 0.9], [86, 178, 0.7],
    [174, 60, 0.8], [122, 128, 0.7], [310, 224, 0.9],
  ];
  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: "radial-gradient(ellipse 78% 78% at 50% 50%, #2a1150 0%, #180a2c 55%, #0e0618 100%)" }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 320 232"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Fades out well before the bottom of the (tall) path box so the
              area under the curve stays a glow, not a solid block, on phones. */}
          <linearGradient id="sk-trail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#ff2233" stopOpacity="0.72"/>
            <stop offset="55%"  stopColor="#a30020" stopOpacity="0.16"/>
            <stop offset="100%" stopColor="#7a0016" stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/* Violet sunburst rays — the game stage's signature backdrop */}
        {rays.map((r, i) => (
          <polygon
            key={i}
            points={`${CX},${CY} ${r.x0},${r.y0} ${r.x1},${r.y1}`}
            fill={i % 2 === 0 ? "rgba(190,160,255,0.055)" : "rgba(255,255,255,0.02)"}
          />
        ))}

        {/* Stars */}
        {stars.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="rgba(220,215,255,0.55)" />
        ))}

        {/* The climb trail: filled area + glowing edge. The fill runs off the
            bottom of the viewBox so the trail stays grounded on tall (phone)
            cards, where the whole 232-unit height is visible. */}
        <path d="M 16 170 C 74 166, 138 146, 190 92 L 190 232 L 16 232 Z" fill="url(#sk-trail)" />
        <path d="M 16 170 C 74 166, 138 146, 190 92" fill="none" stroke="#ff2233" strokeWidth="2.5" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 6px rgba(255,34,51,0.8))" }} />

        {/* Live multiplier — the white readout players watch */}
        <text x="252" y="142" textAnchor="middle" fill="#ffffff" fontSize="30" fontWeight="900"
          fontFamily="'JetBrains Mono','Fira Code',monospace"
          style={{ filter: "drop-shadow(0 0 12px rgba(255,255,255,0.45))" }}>
          2.85×
        </text>
        <text x="252" y="158" textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize="8" fontWeight="700" letterSpacing="3">
          FLYING
        </text>

        {/* ── PLANE ── the exact in-game sprite (same asset the round renders),
            small, anchored at the trail tip with a slight climb tilt, fully
            inside the safe band so the propeller never clips. */}
        <g transform="translate(190,92) rotate(-8)">
          <image
            href="/planes/plane-1.svg"
            x="-4" y="-28" width="66" height="32.6"
            style={{ filter: "drop-shadow(0 0 8px rgba(229,5,57,0.55))" }}
          />
        </g>

      </svg>
    </div>
  );
}

export function CoinFlipArt() {
  const sparkles: [number, number, boolean][] = [
    [90, 8, false], [90, 120, false], [22, 64, false], [158, 64, false],
    [42, 22, true], [138, 22, true], [42, 106, true], [138, 106, true],
  ];

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Sparkle lines */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 180 128">
        {sparkles.map(([x, y, diag], i) => (
          <g key={i} transform={diag ? `rotate(45 ${x} ${y})` : ''} opacity="0.22">
            <line x1={x-7} y1={y} x2={x+7} y2={y} stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1={x} y1={y-7} x2={x} y2={y+7} stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
          </g>
        ))}
      </svg>

      {/* Main coin */}
      <svg
        viewBox="0 0 100 100"
        width="90"
        height="90"
        className="relative z-10"
        style={{ filter: 'drop-shadow(0 0 20px rgba(245,158,11,0.7)) drop-shadow(0 8px 18px rgba(0,0,0,0.65))' }}
      >
        <defs>
          <radialGradient id="cf-gold" cx="32%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#fef3c7"/>
            <stop offset="40%" stopColor="#f59e0b"/>
            <stop offset="100%" stopColor="#92400e"/>
          </radialGradient>
        </defs>
        {/* Coin depth (edge) */}
        <ellipse cx="50" cy="54" rx="36" ry="36" fill="#78350f"/>
        {/* Coin face */}
        <ellipse cx="50" cy="48" rx="36" ry="36" fill="url(#cf-gold)"/>
        {/* Ring details */}
        <ellipse cx="50" cy="48" rx="29" ry="29" fill="none" stroke="rgba(254,243,199,0.28)" strokeWidth="2.5"/>
        <ellipse cx="50" cy="48" rx="34" ry="34" fill="none" stroke="rgba(254,243,199,0.12)" strokeWidth="1"/>
        {/* H */}
        <text x="50" y="53" textAnchor="middle" dominantBaseline="middle" fill="rgba(120,53,15,0.88)" fontSize="32" fontWeight="900" fontFamily="Georgia,serif">H</text>
      </svg>

      {/* Small "T" coin */}
      <svg
        viewBox="0 0 60 60"
        width="38"
        height="38"
        className="absolute bottom-3 right-5 opacity-40"
        style={{ transform: 'rotate(-14deg)' }}
      >
        <ellipse cx="30" cy="33" rx="22" ry="22" fill="#78350f"/>
        <ellipse cx="30" cy="28" rx="22" ry="22" fill="#f59e0b"/>
        <text x="30" y="28" textAnchor="middle" dominantBaseline="middle" fill="rgba(120,53,15,0.78)" fontSize="20" fontWeight="900" fontFamily="Georgia,serif">T</text>
      </svg>
    </div>
  );
}

export function CardsArt() {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <svg
        viewBox="0 0 170 120"
        className="w-full h-full"
        style={{ filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.75))' }}
      >
        {/* Back card — green, rotated left */}
        <g transform="rotate(-18 72 62)">
          <rect x="22" y="12" width="52" height="74" rx="6" fill="#065f46"/>
          <rect x="25" y="15" width="46" height="68" rx="5" fill="#047857"/>
          <rect x="29" y="19" width="38" height="60" rx="3" fill="none" stroke="rgba(255,255,255,0.11)" strokeWidth="1.5"/>
          <text x="48" y="52" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.14)" fontSize="18" fontFamily="serif">✦</text>
        </g>

        {/* Middle card — K♥, slight tilt */}
        <g transform="rotate(-5 85 62)">
          <rect x="36" y="9" width="52" height="74" rx="6" fill="#d1d5db"/>
          <rect x="38" y="11" width="48" height="70" rx="5" fill="#f9fafb"/>
          <text x="43" y="26" fill="#dc2626" fontSize="12" fontWeight="bold" fontFamily="Georgia,serif">K</text>
          <text x="43" y="37" fill="#dc2626" fontSize="9" fontFamily="Georgia,serif">♥</text>
          <text x="83" y="72" fill="#dc2626" fontSize="12" fontWeight="bold" fontFamily="Georgia,serif" transform="rotate(180 83 72)">K</text>
          <text x="62" y="49" textAnchor="middle" dominantBaseline="middle" fill="#dc2626" fontSize="24" fontFamily="Georgia,serif">♥</text>
        </g>

        {/* Front card — A♠, right tilt */}
        <g transform="rotate(14 112 62)">
          <rect x="68" y="9" width="52" height="74" rx="6" fill="#d1d5db"/>
          <rect x="70" y="11" width="48" height="70" rx="5" fill="white"/>
          <text x="75" y="26" fill="#111827" fontSize="12" fontWeight="bold" fontFamily="Georgia,serif">A</text>
          <text x="75" y="37" fill="#111827" fontSize="9" fontFamily="Georgia,serif">♠</text>
          <text x="115" y="72" fill="#111827" fontSize="12" fontWeight="bold" fontFamily="Georgia,serif" transform="rotate(180 115 72)">A</text>
          <text x="94" y="50" textAnchor="middle" dominantBaseline="middle" fill="#111827" fontSize="28" fontFamily="Georgia,serif">♠</text>
        </g>
      </svg>
    </div>
  );
}

export function LimboArt() {
  // A static "poster" of the in-game 3D warp: dark space, gold streaks radiating
  // from a faint halo, and a glowing multiplier. Paints its own background so it
  // reads identically to the game regardless of the card gradient behind it.
  const cx = 100, cy = 64;
  // Round trig output to 2dp: Math.cos/sin can differ by an ULP between the
  // server's V8 and the browser's, which shows up as a hydration mismatch.
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // Streaks radiate outward from just beyond the halo — the warp, frozen.
  const streaks = Array.from({ length: 30 }, (_, i) => {
    const a = (i / 30) * Math.PI * 2 + (i % 3) * 0.17;
    const inner = 46 + (i % 5) * 5;
    const len = 10 + (i % 4) * 11 + (i % 7) * 2;
    const gold = i % 5 === 0;
    return {
      x1: r2(cx + Math.cos(a) * inner),
      y1: r2(cy + Math.sin(a) * inner),
      x2: r2(cx + Math.cos(a) * (inner + len)),
      y2: r2(cy + Math.sin(a) * (inner + len)),
      gold,
      o: r2(0.28 + (i % 4) * 0.16),
    };
  });

  // Sparse stars scattered on a golden-angle spiral (deterministic → SSR-safe).
  const stars = Array.from({ length: 24 }, (_, i) => {
    const a = i * 2.399;
    const r = 14 + ((i * 17) % 78);
    return { x: r2(cx + Math.cos(a) * r * 1.45), y: r2(cy + Math.sin(a) * r), gold: i % 6 === 0 };
  });

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(ellipse 78% 82% at 50% 46%, #0b1120 0%, #070a12 68%, #05060d 100%)" }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 128" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="limbo-card-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        {stars.map((s, i) => (
          <circle key={`s${i}`} cx={s.x} cy={s.y} r={s.gold ? 1.1 : 0.8}
            fill={s.gold ? "rgba(242,154,11,0.85)" : "rgba(200,220,255,0.5)"} />
        ))}

        {streaks.map((st, i) => (
          <line key={`l${i}`} x1={st.x1} y1={st.y1} x2={st.x2} y2={st.y2}
            stroke={st.gold ? "rgba(242,154,11,0.9)" : "rgba(190,215,255,0.72)"}
            strokeWidth={st.gold ? 1.6 : 1.1} strokeLinecap="round" opacity={st.o} />
        ))}

        {/* Faint gold halo, matching the game's target ring */}
        <circle cx={cx} cy={cy} r="42" fill="none" stroke="rgba(242,154,11,0.4)" strokeWidth="1.4" filter="url(#limbo-card-glow)" />
        <circle cx={cx} cy={cy} r="42" fill="none" stroke="rgba(242,154,11,0.6)" strokeWidth="0.7" />
      </svg>

      {/* Soft focal glow behind the readout */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 50% 50%, rgba(242,154,11,0.14), transparent 42%)" }} />

      {/* Multiplier readout — white with gold glow, like the in-game number */}
      <div
        className="relative z-10 font-bp-mono text-[36px] font-black tracking-[-2px] text-white"
        style={{ filter: "drop-shadow(0 0 18px rgba(242,154,11,0.75)) drop-shadow(0 4px 12px rgba(0,0,0,0.7))" }}
      >
        7.34<span className="text-bp-accent">×</span>
      </div>
    </div>
  );
}

export function DragonTowerArt() {
  // A poster of the in-game look: furnace-lit tower, a climbing path of glowing
  // eggs, one blazing dragon eye, and a gold "active row" of ? tiles on top.
  // Paints its own background so it reads the same over any card gradient.
  const embers: [number, number, number, number][] = [
    [12, 20, 1.2, 0.5], [30, 88, 1, 0.4], [178, 30, 1.3, 0.55], [160, 100, 1, 0.4],
    [90, 8, 1, 0.35], [50, 120, 1.2, 0.5], [190, 70, 0.9, 0.35], [8, 60, 1, 0.4],
    [110, 118, 1, 0.45], [148, 12, 1, 0.4], [70, 34, 0.8, 0.3], [20, 105, 0.9, 0.4],
    [185, 115, 1.1, 0.45], [130, 92, 0.8, 0.3],
  ];
  // Tower geometry: 4 rows × 3 tiles, bottom → top. Picked eggs zigzag upward.
  // Rows sit inside y 22–114 so `slice` cropping never clips the top ? row or
  // the bottom of the path, and the NEW badge keeps clear of the top tiles.
  const tileX = [49, 85, 121];
  const rowY = [94, 70, 46, 22];
  const eggAt: [number, number][] = [[0, 0], [1, 1], [2, 0]]; // [row, tile]
  const eyeAt: [number, number] = [2, 2];

  const center = (r: number, t: number): [number, number] => [tileX[t] + 15, rowY[r] + 10];
  const eggSet = new Set(eggAt.map(([r, t]) => `${r}-${t}`));
  const pathPts: [number, number][] = [...eggAt.map(([r, t]) => center(r, t)), [100, 32]];
  const [eyeCx, eyeCy] = center(eyeAt[0], eyeAt[1]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: "radial-gradient(ellipse 90% 55% at 50% -5%, rgba(249,115,22,0.16) 0%, transparent 60%), radial-gradient(ellipse 70% 45% at 50% 108%, rgba(190,24,93,0.26) 0%, transparent 65%), linear-gradient(180deg, #150818 0%, #0c0511 100%)" }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="dta-egg2" cx="35%" cy="26%" r="82%">
            <stop offset="0%" stopColor="#f0fdfa" />
            <stop offset="38%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#047857" />
          </radialGradient>
          <radialGradient id="dta-iris2" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="40%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </radialGradient>
        </defs>

        {/* Drifting embers */}
        {embers.map(([x, y, r, o], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={i % 3 === 0 ? "#fbbf24" : "#fb923c"} opacity={o} />
        ))}

        {/* Climbed path connecting the eggs up to the active row */}
        <polyline
          points={pathPts.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none" stroke="rgba(94,234,212,0.28)" strokeWidth="1.6" strokeDasharray="3 4" strokeLinecap="round"
        />

        {/* Tower tiles */}
        {rowY.map((y, r) =>
          tileX.map((x, t) => {
            const isTop = r === 3;
            const isEgg = eggSet.has(`${r}-${t}`);
            const isEye = r === eyeAt[0] && t === eyeAt[1];
            return (
              <rect
                key={`${r}-${t}`}
                x={x} y={y} width="30" height="20" rx="5"
                fill={isTop ? "rgba(242,154,11,0.09)" : isEgg ? "rgba(94,234,212,0.10)" : isEye ? "rgba(255,93,115,0.10)" : "rgba(255,255,255,0.035)"}
                stroke={isTop ? "rgba(242,154,11,0.5)" : isEgg ? "rgba(94,234,212,0.5)" : isEye ? "rgba(255,93,115,0.55)" : "rgba(255,255,255,0.08)"}
                strokeWidth={isTop || isEgg || isEye ? 1.3 : 0.8}
              />
            );
          }),
        )}

        {/* Active-row runes */}
        {tileX.map((x, i) => (
          <text key={i} x={x + 15} y={rowY[3] + 14.5} textAnchor="middle" fontSize="11" fontWeight="900"
            fontFamily="monospace" fill="#f29a0b" opacity="0.85"
            style={{ filter: "drop-shadow(0 0 5px rgba(242,154,11,0.8))" }}>?</text>
        ))}

        {/* Glowing eggs on the climbed path */}
        {eggAt.map(([r, t], i) => {
          const [cx, cy] = center(r, t);
          return (
            <g key={i}>
              <ellipse cx={cx} cy={cy} rx="6.5" ry="8.2" fill="url(#dta-egg2)"
                style={{ filter: "drop-shadow(0 0 3px rgba(110,231,183,.9)) drop-shadow(0 0 9px rgba(52,211,153,.7))" }} />
              <ellipse cx={cx - 2.5} cy={cy - 3.5} rx="1.7" ry="2.4" fill="rgba(255,255,255,.7)" />
            </g>
          );
        })}

        {/* The dragon eye */}
        <g style={{ filter: "drop-shadow(0 0 4px rgba(253,186,116,.9)) drop-shadow(0 0 12px rgba(249,115,22,.75))" }}>
          <path d={`M ${eyeCx - 10} ${eyeCy} Q ${eyeCx} ${eyeCy - 8} ${eyeCx + 10} ${eyeCy} Q ${eyeCx} ${eyeCy + 8} ${eyeCx - 10} ${eyeCy} Z`}
            fill="#1c0505" stroke="rgba(255,120,90,0.55)" strokeWidth="1" />
          <circle cx={eyeCx} cy={eyeCy} r="4.6" fill="url(#dta-iris2)" />
          <path d={`M ${eyeCx} ${eyeCy - 4.4} C ${eyeCx + 1.1} ${eyeCy - 2}, ${eyeCx + 1.1} ${eyeCy + 2}, ${eyeCx} ${eyeCy + 4.4} C ${eyeCx - 1.1} ${eyeCy + 2}, ${eyeCx - 1.1} ${eyeCy - 2}, ${eyeCx} ${eyeCy - 4.4} Z`} fill="#0a0202" />
          <ellipse cx={eyeCx - 1.8} cy={eyeCy - 1.8} rx="0.9" ry="1.3" fill="rgba(255,255,255,.65)" />
        </g>
      </svg>
    </div>
  );
}

export function AndarBaharArt() {
  // A central joker flanked by two fanned piles — Andar (left) / Bahar (right).
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Felt glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(16,185,129,0.18), transparent 60%)" }}
      />
      <svg
        viewBox="0 0 200 130"
        className="w-full h-full"
        style={{ filter: "drop-shadow(0 10px 26px rgba(0,0,0,0.7))" }}
      >
        {/* Left pile (Andar) — fanned, tilted left */}
        {[0, 1, 2].map((i) => (
          <g key={`a${i}`} transform={`rotate(${-16 + i * 5} ${44 + i * 6} 70)`}>
            <rect x={28 + i * 9} y={44} width="34" height="50" rx="5" fill="#d1d5db" />
            <rect x={30 + i * 9} y={46} width="30" height="46" rx="4" fill="#f9fafb" />
          </g>
        ))}

        {/* Right pile (Bahar) — fanned, tilted right */}
        {[0, 1, 2].map((i) => (
          <g key={`b${i}`} transform={`rotate(${16 - i * 5} ${156 - i * 6} 70)`}>
            <rect x={138 - i * 9} y={44} width="34" height="50" rx="5" fill="#d1d5db" />
            <rect x={140 - i * 9} y={46} width="30" height="46" rx="4" fill="#f9fafb" />
          </g>
        ))}

        {/* Centre joker — slightly raised, glowing */}
        <g transform="translate(0,-6)">
          <rect x="84" y="34" width="40" height="58" rx="6" fill="#0f766e" />
          <rect x="86" y="36" width="36" height="54" rx="5" fill="#ffffff" />
          <text x="92" y="50" fill="#e02b4a" fontSize="13" fontWeight="bold" fontFamily="Georgia,serif">J</text>
          <text x="92" y="62" fill="#e02b4a" fontSize="10" fontFamily="Georgia,serif">♥</text>
          <text x="104" y="74" textAnchor="middle" dominantBaseline="middle" fill="#e02b4a" fontSize="22" fontFamily="Georgia,serif">♥</text>
        </g>
      </svg>

      {/* Side labels */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-between px-5 font-bp-mono text-[10px] font-black uppercase tracking-[2px]">
        <span className="text-emerald-300/70">Andar</span>
        <span className="text-emerald-300/70">Bahar</span>
      </div>
    </div>
  );
}

export function PlinkoArt() {
  // Peg triangle + a glowing ball + a row of coloured buckets.
  const pegRows = [0, 1, 2, 3, 4];
  const buckets = ["#5eead4", "#f29a0b", "#a78bfa", "#f29a0b", "#5eead4", "#a78bfa", "#f43f5e"];
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 30%, rgba(139,92,246,0.2), transparent 60%)" }}
      />
      <svg viewBox="0 0 200 150" className="w-full h-full" style={{ filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.6))" }}>
        {/* Pegs */}
        {pegRows.map((r) =>
          Array.from({ length: r + 2 }).map((_, c) => {
            const cx = 100 + (c - (r + 1) / 2) * 24;
            const cy = 22 + r * 19;
            return <circle key={`${r}-${c}`} cx={cx} cy={cy} r="2.4" fill="rgba(255,255,255,0.32)" />;
          }),
        )}
        {/* Ball */}
        <circle cx="112" cy="48" r="5.5" fill="#f29a0b" style={{ filter: "drop-shadow(0 0 8px rgba(242,154,11,0.9))" }} />
        {/* Buckets */}
        {buckets.map((col, i) => (
          <rect
            key={i}
            x={20 + i * 23.4}
            y={128}
            width="20"
            height="16"
            rx="3"
            fill={col}
            opacity="0.85"
          />
        ))}
      </svg>
    </div>
  );
}

export function KenoArt() {
  // A mini number grid with a few "drawn" numbers lit up.
  const lit = new Set([3, 7, 12, 18]); // highlighted (hit) cells
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 40%, rgba(99,102,241,0.2), transparent 60%)" }}
      />
      <svg viewBox="0 0 200 130" className="w-full h-full" style={{ filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.6))" }}>
        {Array.from({ length: 24 }).map((_, i) => {
          const col = i % 8;
          const row = Math.floor(i / 8);
          const x = 22 + col * 21;
          const y = 26 + row * 28;
          const on = lit.has(i);
          return (
            <g key={i}>
              <rect
                x={x} y={y} width="17" height="20" rx="4"
                fill={on ? "rgba(94,234,212,0.22)" : "rgba(255,255,255,0.05)"}
                stroke={on ? "rgba(94,234,212,0.6)" : "rgba(255,255,255,0.08)"}
                strokeWidth={on ? "1.4" : "0.8"}
                style={on ? { filter: "drop-shadow(0 0 6px rgba(94,234,212,0.6))" } : undefined}
              />
            </g>
          );
        })}
        {/* A couple of lottery balls */}
        <circle cx="150" cy="40" r="12" fill="#6366f1" style={{ filter: "drop-shadow(0 0 8px rgba(99,102,241,0.8))" }} />
        <text x="150" y="44" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="900" fontFamily="monospace">7</text>
        <circle cx="172" cy="64" r="10" fill="#5eead4" style={{ filter: "drop-shadow(0 0 8px rgba(94,234,212,0.7))" }} />
        <text x="172" y="68" textAnchor="middle" fill="#06302a" fontSize="10" fontWeight="900" fontFamily="monospace">23</text>
      </svg>
    </div>
  );
}

export function MinesArt() {
  type Cell = 'hidden' | 'safe' | 'bomb';
  const grid: Cell[][] = [
    ['hidden', 'safe',   'hidden', 'safe',   'hidden'],
    ['safe',   'hidden', 'safe',   'hidden',  'safe'  ],
    ['hidden', 'safe',   'bomb',   'safe',    'hidden'],
    ['safe',   'hidden', 'safe',   'hidden',  'safe'  ],
    ['hidden', 'safe',   'hidden', 'safe',    'hidden'],
  ];

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <svg
        viewBox="0 0 130 130"
        width="110"
        height="110"
        className="relative z-10"
        style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.55))' }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const x = c * 24 + 8;
            const y = r * 24 + 8;

            if (cell === 'safe') {
              return (
                <rect key={`${r}-${c}`} x={x} y={y} width="20" height="20" rx="3"
                  fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
              );
            }
            if (cell === 'bomb') {
              return (
                <g key={`${r}-${c}`}>
                  <rect x={x} y={y} width="20" height="20" rx="3"
                    fill="rgba(239,68,68,0.14)" stroke="rgba(248,113,113,0.5)" strokeWidth="1.5"/>
                  <circle cx={x+10} cy={y+11.5} r="5" fill="#1f2937" stroke="#ef4444" strokeWidth="1.5"/>
                  <line x1={x+10} y1={y+4}    x2={x+10} y2={y+6.5} stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1={x+10} y1={y+16.5} x2={x+10} y2={y+19}  stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1={x+3}  y1={y+11.5} x2={x+5}  y2={y+11.5} stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1={x+15} y1={y+11.5} x2={x+17} y2={y+11.5} stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d={`M ${x+14} ${y+7} C ${x+17} ${y+3} ${x+19} ${y+5} ${x+17} ${y+1.5}`} fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx={x+17} cy={y+1.5} r="1.5" fill="#fbbf24"/>
                </g>
              );
            }
            return (
              <rect key={`${r}-${c}`} x={x} y={y} width="20" height="20" rx="3"
                fill="rgba(244,63,94,0.2)" stroke="rgba(251,113,133,0.17)" strokeWidth="0.5"/>
            );
          })
        )}
      </svg>
      {/* Centre glow */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(239,68,68,0.12), transparent 55%)' }}
      />
    </div>
  );
}

// Coded card art keyed by GameSlug — the default lobby card visual. A game row can
// override this with `cardImageUrl` from the admin panel; otherwise the lobby falls
// back to the matching component here.
export function DragonTigerArt() {
  // The clash poster, built from the same hero art the round renders
  // (`/games/dragon-tiger/*`) instead of the old flat card-and-roundel SVG:
  // azure dragon on the left, ember tiger on the right, gold VS emblem between
  // them over a split blue/fire arena.
  //
  // Everything is positioned in PERCENTAGES of the card box, so the heroes sit
  // at fractions of the width (not pinned to the edges) and the middle never
  // goes empty on wide cards.
  //
  // The card height is fixed while its width tracks the viewport up to the
  // lobby's 600px column, so the box goes from ~288×208 to 568×208. At the
  // narrow end there is not enough width for two full-body heroes AND a big
  // centre emblem: the tiger's face (inset ~10% from its canvas edge) ends up
  // behind the emblem, leaving a cover of dragon + coin + tiger hindquarters.
  // So under 480px the emblem shrinks and both heroes shift outward until each
  // face clears it — the tiger's tail bleeding off the right edge is the
  // cheaper loss. `min-[480px]:` restores the roomier composition.
  //
  // `next/image` + a fixed `sizes` keeps this cheap: the source art is
  // 667×1000, the card only ever needs ~140–180px of it.
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Arena — cold half vs hot half */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(100deg,#04223d 0%,#0a1836 32%,#160d22 50%,#2b1206 68%,#3f1703 100%)" }}
      />
      {/* Side auras + the gold flash where they meet */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 14% 58%, rgba(56,189,248,0.40), transparent 45%), radial-gradient(circle at 86% 58%, rgba(249,115,22,0.42), transparent 45%), radial-gradient(circle at 50% 46%, rgba(245,182,10,0.30), transparent 32%)",
        }}
      />
      {/* Clash glow on the centre line — kept as an ellipse (a hard-edged
          rectangular beam shows a visible seam on the flat gradient). */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 16% 62% at 50% 46%, rgba(255,214,120,0.20), transparent 70%)" }}
      />

      {/* Dragon — faces right; subject is vertically centred in its canvas */}
      <Image
        src="/games/dragon-tiger/dragon-hero.webp"
        alt=""
        width={667}
        height={1000}
        sizes="150px"
        draggable={false}
        className="pointer-events-none absolute left-[22%] top-1/2 h-[88%] w-auto -translate-x-1/2 -translate-y-1/2 select-none object-contain min-[480px]:left-[28%] min-[480px]:h-[96%]"
        style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.6)) drop-shadow(0 0 20px rgba(56,189,248,0.35))" }}
      />
      {/* Tiger — faces left; its subject sits in the top ~60% of the canvas, so
          it is scaled up and pulled down (−50% + 15%) to land on the same line. */}
      <Image
        src="/games/dragon-tiger/tiger-hero.webp"
        alt=""
        width={667}
        height={1000}
        sizes="190px"
        draggable={false}
        className="pointer-events-none absolute left-[84%] top-1/2 h-[108%] w-auto -translate-x-1/2 -translate-y-[35%] select-none object-contain min-[480px]:left-[72%] min-[480px]:h-[122%]"
        style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.6)) drop-shadow(0 0 20px rgba(249,115,22,0.4))" }}
      />
      {/* VS emblem — drawn last so it sits over the point where the two heroes
          overlap on narrow cards */}
      <Image
        src="/games/dragon-tiger/vs-emblem.webp"
        alt=""
        width={512}
        height={512}
        sizes="120px"
        draggable={false}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[38%] w-auto -translate-x-1/2 -translate-y-[54%] select-none object-contain min-[480px]:h-[52%]"
        style={{ filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.65))" }}
      />

      {/* Floor vignette so the labels stay readable over the art */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]"
        style={{ background: "linear-gradient(180deg, transparent, rgba(3,2,10,0.72))" }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex items-center justify-between px-3 font-bp-mono text-[9px] font-black uppercase tracking-[1.5px]">
        <span className="text-sky-300/80">Dragon</span>
        <span className="rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 text-[8.5px] text-emerald-300">
          Tie 8:1
        </span>
        <span className="text-amber-300/85">Tiger</span>
      </div>
    </div>
  );
}

export function TeenPattiArt() {
  // Same construction as DragonTigerArt — built from the round's own art
  // (`/games/teen-patti/*`) rather than a flat SVG — but on this game's identity:
  // a Mughal card room in emerald and gold, sapphire peacock crest on the left,
  // crimson elephant crest on the right, and the Trail rank medallion between
  // them standing in for DT's VS emblem.
  //
  // Everything is positioned in PERCENTAGES of the card box for the same reason:
  // the card runs ~288×208 to 568×208, so the crests sit at fractions of the
  // width and the centre never empties out. Under 480px the medallion shrinks
  // and both crests shift outward so neither bird nor elephant is buried by it.
  //
  // Source art is 768×768 and the card only ever needs ~130–170px of it, so the
  // fixed `sizes` keeps the download small.
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Table — emerald felt deepening to the corners */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(100deg,#07241c 0%,#0d3b2e 34%,#123a2c 50%,#3c1120 72%,#4a0f1e 100%)" }}
      />
      {/* Side auras + the gold flash where they meet */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 14% 58%, rgba(27,58,143,0.42), transparent 45%), radial-gradient(circle at 86% 58%, rgba(168,31,58,0.44), transparent 45%), radial-gradient(circle at 50% 46%, rgba(212,160,44,0.30), transparent 32%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 16% 62% at 50% 46%, rgba(240,199,94,0.20), transparent 70%)" }}
      />

      {/* Peacock crest — Player A */}
      <Image
        src="/games/teen-patti/crest-a.webp"
        alt=""
        width={768}
        height={768}
        sizes="150px"
        draggable={false}
        className="pointer-events-none absolute left-[21%] top-1/2 h-[86%] w-auto -translate-x-1/2 -translate-y-1/2 select-none object-contain min-[480px]:left-[27%] min-[480px]:h-[94%]"
        style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.6)) drop-shadow(0 0 20px rgba(56,120,248,0.35))" }}
      />
      {/* Elephant crest — Player B */}
      <Image
        src="/games/teen-patti/crest-b.webp"
        alt=""
        width={768}
        height={768}
        sizes="150px"
        draggable={false}
        className="pointer-events-none absolute left-[79%] top-1/2 h-[86%] w-auto -translate-x-1/2 -translate-y-1/2 select-none object-contain min-[480px]:left-[73%] min-[480px]:h-[94%]"
        style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.6)) drop-shadow(0 0 20px rgba(224,169,44,0.4))" }}
      />
      {/* Trail medallion — drawn last so it sits over the point where the two
          crests overlap on narrow cards */}
      <Image
        src="/games/teen-patti/rank-trail.webp"
        alt=""
        width={512}
        height={512}
        sizes="120px"
        draggable={false}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36%] w-auto -translate-x-1/2 -translate-y-[54%] select-none object-contain min-[480px]:h-[50%]"
        style={{ filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.65))" }}
      />

      {/* Floor vignette so the labels stay readable over the art */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]"
        style={{ background: "linear-gradient(180deg, transparent, rgba(3,10,8,0.74))" }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex items-center justify-between px-3 font-bp-mono text-[9px] font-black uppercase tracking-[1.5px]">
        <span className="text-sky-300/80">Player A</span>
        <span className="rounded-full border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 text-[8.5px] text-amber-300">
          Pair+ 3.70×
        </span>
        <span className="text-rose-300/85">Player B</span>
      </div>
    </div>
  );
}

export const CARD_ART: Record<string, FC> = {
  "dice-3d": DiceArt,
  skyrise: SkyRiseArt,
  coinflip: CoinFlipArt,
  "hi-lo": CardsArt,
  mines: MinesArt,
  limbo: LimboArt,
  "dragon-tower": DragonTowerArt,
  "andar-bahar": AndarBaharArt,
  plinko: PlinkoArt,
  keno: KenoArt,
  "dragon-tiger": DragonTigerArt,
  "teen-patti": TeenPattiArt,
};
