"use client";

import { useMemo } from "react";

// Shared look for the round monitor: deep teal/navy field, drifting binary
// rain, and the mint→cyan accent the Aviator table already uses.

export const ACCENT_GRADIENT = "linear-gradient(90deg, #2bf7a3 0%, #22d3ee 100%)";
export const MINT = "#35ffb0";

const RAIN_COLUMNS = 18;
const DIGITS_PER_COLUMN = 60;

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Falling 0/1 columns. Seeded rather than Math.random() because this renders on
 * the server too — random digits would differ between the server HTML and the
 * first client render and trip a hydration mismatch.
 */
export function BinaryRain() {
  const columns = useMemo(
    () =>
      Array.from({ length: RAIN_COLUMNS }, (_, i) => {
        const rnd = mulberry32(i * 9176 + 17);
        const digits = Array.from({ length: DIGITS_PER_COLUMN }, () =>
          rnd() < 0.5 ? "0" : "1",
        );
        return {
          i,
          left: (i / RAIN_COLUMNS) * 100 + rnd() * 2,
          duration: 14 + rnd() * 16,
          delay: -rnd() * 20,
          opacity: 0.05 + rnd() * 0.09,
          // Doubled so translating by exactly half the strip loops seamlessly.
          text: [...digits, ...digits],
        };
      }),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {columns.map((c) => (
        <div
          key={c.i}
          className="sig-rain absolute top-0 font-mono text-[12px] leading-[1.7] text-[#2bf7a3] select-none"
          style={{
            left: `${c.left}%`,
            opacity: c.opacity,
            animation: `sig-fall ${c.duration}s linear ${c.delay}s infinite`,
          }}
        >
          {c.text.map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The page background + keyframes. Rendered once per screen. */
export function SignalBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(1200px 700px at 12% -5%, rgba(20,120,120,0.34) 0%, transparent 58%)," +
            "radial-gradient(900px 600px at 95% 105%, rgba(58,42,120,0.30) 0%, transparent 60%)," +
            "linear-gradient(180deg, #071018 0%, #08131c 45%, #0a1020 100%)",
        }}
      />
      <BinaryRain />
      <style>{`
        @keyframes sig-fall { from { transform: translateY(-50%) } to { transform: translateY(0) } }
        @keyframes sig-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }
        @keyframes sig-idle { 0%,100% { opacity: 0.55 } 50% { opacity: 1 } }
        @keyframes sig-spin { to { transform: rotate(360deg) } }
        @keyframes sig-sweep {
          0% { transform: translateX(-100%); opacity: 0 }
          35% { opacity: 1 }
          65% { opacity: 1 }
          100% { transform: translateX(100%); opacity: 0 }
        }
        @media (prefers-reduced-motion: reduce) {
          .sig-rain { animation: none !important }
        }
      `}</style>
    </>
  );
}

/** The frosted panel everything sits inside. */
export function SignalCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 w-full max-w-md rounded-[28px] border border-white/[0.07] bg-[#0d1a24]/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-7">
      {children}
    </div>
  );
}

/** One of the 2×2 info tiles, with the mint→cyan cap along its top edge. */
export function SignalTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.022] px-4 pb-3.5 pt-4">
      <span
        className="absolute inset-x-3 top-0 h-[2px] rounded-full"
        style={{ background: ACCENT_GRADIENT }}
      />
      <div className="text-[13px] font-bold text-white/90">{label}</div>
      <div
        className={`mt-2 truncate font-mono text-[15px] ${accent ? "text-white/85" : "text-white/45"}`}
      >
        {value}
      </div>
    </div>
  );
}
