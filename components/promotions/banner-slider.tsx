"use client";

import { useState, useEffect, useRef } from "react";
import { PromotionBannerCard } from "./promotion-cards";
import type { PromotionData } from "./promotion-cards";
import { usePromoCta } from "@/lib/use-promo-cta";
import { playClick } from "@/lib/sound";

const SLIDE_MS = 4500;

export function BannerSlider({ promos }: { promos: PromotionData[] }) {
  const resolve = usePromoCta();
  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);

  // setTimeout: resets naturally whenever idx changes (manual or auto)
  useEffect(() => {
    if (promos.length <= 1) return;
    const id = setTimeout(
      () => setIdx((i) => (i + 1) % promos.length),
      SLIDE_MS,
    );
    return () => clearTimeout(id);
  }, [idx, promos.length]);

  const goTo = (next: number) => {
    const n = ((next % promos.length) + promos.length) % promos.length;
    if (n !== idx) { playClick(); setIdx(n); }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = touchX.current - e.changedTouches[0].clientX;
    if (Math.abs(dx) > 44) goTo(idx + (dx > 0 ? 1 : -1));
    touchX.current = null;
  };

  if (promos.length === 0) return null;

  if (promos.length === 1) {
    return (
      <PromotionBannerCard
        promo={promos[0]}
        onCtaClick={resolve(promos[0].cta_action)}
      />
    );
  }

  return (
    <div className="space-y-2.5">
      <div
        className="overflow-hidden rounded-[24px] border border-white/[0.08]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-[450ms] ease-out will-change-transform"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {promos.map((p) => (
            <div key={p.id} className="min-w-full">
              {/* variant="inSlider" strips individual border/rounding — container owns them */}
              <PromotionBannerCard
                promo={p}
                onCtaClick={resolve(p.cta_action)}
                variant="inSlider"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Pill-dot indicators — active dot stretches to a wider pill */}
      <div className="flex items-center justify-center gap-1.5">
        {promos.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Slide ${i + 1}`}
            className={`rounded-full transition-all duration-300 ${
              i === idx
                ? "h-1.5 w-5 bg-bp-accent"
                : "h-1.5 w-1.5 bg-white/[0.18] hover:bg-white/35"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
