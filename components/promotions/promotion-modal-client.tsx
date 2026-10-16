"use client";

import { useEffect, useState } from "react";
import type { PromotionData } from "./promotion-cards";
import { PromotionModalCard } from "./promotion-cards";
import { usePromoCta } from "@/lib/use-promo-cta";

function shouldShow(promo: PromotionData): boolean {
  const freq = promo.show_frequency ?? "always";

  if (freq === "always") return true;

  if (freq === "once") {
    const key = `promo_seen_${promo.id}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  }

  if (freq === "daily") {
    const key = `promo_daily_${promo.id}`;
    const today = new Date().toDateString();
    if (localStorage.getItem(key) === today) return false;
    localStorage.setItem(key, today);
    return true;
  }

  return true;
}

export function LobbyPromotionModals({ modals }: { modals: PromotionData[] }) {
  const resolve = usePromoCta();
  const [visible, setVisible] = useState<PromotionData | null>(null);

  useEffect(() => {
    const eligible = modals.find(shouldShow);
    if (eligible) setVisible(eligible);
  }, [modals]);

  if (!visible) return null;

  const ctaClick = resolve(visible.cta_action);

  return (
    <div className="fixed inset-0 !-mt-4 z-50 flex items-end justify-center bg-black/70 p-4 pb-8 backdrop-blur-sm">
      <div className="w-full max-w-[600px] !pb-[50px]">
        <PromotionModalCard promo={visible} onCtaClick={ctaClick} />
        <button
          onClick={() => setVisible(null)}
          className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
