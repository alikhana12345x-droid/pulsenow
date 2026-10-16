"use client";

import { useEffect, useState } from "react";
import type { PromotionData } from "./promotion-cards";
import { PromotionToastCard } from "./promotion-cards";
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

export function LobbyPromotionToasts({ toasts }: { toasts: PromotionData[] }) {
  const resolve = usePromoCta();
  const [visible, setVisible] = useState<PromotionData[]>([]);

  useEffect(() => {
    setVisible(toasts.filter(shouldShow));
  }, [toasts]);

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((p) => (
        <PromotionToastCard key={p.id} promo={p} onCtaClick={resolve(p.cta_action)} />
      ))}
    </div>
  );
}
