"use client";

import { useState, type ReactNode } from "react";

export function PromotionsTabs({
  platformTab,
  playersTab,
}: {
  platformTab: ReactNode;
  playersTab: ReactNode;
}) {
  const [tab, setTab] = useState<"platform" | "players">("platform");

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-full border border-border/70 bg-card/70 p-1 w-fit">
        <button
          onClick={() => setTab("platform")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
            tab === "platform"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          Platform Promotions
        </button>
        <button
          onClick={() => setTab("players")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
            tab === "players"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          Promotion Players
        </button>
      </div>

      {/* Tab panels */}
      <div>{tab === "platform" ? platformTab : playersTab}</div>
    </div>
  );
}
