"use client";

import { useRouter } from "next/navigation";
import { useTransition, useEffect, useRef, useState } from "react";

const INTERVALS = [
  { value: 0, label: "Off" },
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 300, label: "5m" },
  { value: 600, label: "10m" },
];

export function RefreshControls() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [intervalSecs, setIntervalSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (intervalSecs > 0) {
      timerRef.current = setInterval(refresh, intervalSecs * 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalSecs]);

  return (
    <div className="flex items-center gap-1.5">
      {/* Refresh button */}
      <button
        onClick={refresh}
        disabled={isPending}
        title="Refresh data"
        className="flex items-center justify-center rounded-lg border border-border/70 bg-card/80 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isPending ? "animate-spin" : ""}
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
      </button>

      {/* Auto-refresh interval picker */}
      <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-card/80 p-1">
        {INTERVALS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setIntervalSecs(value)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              intervalSecs === value
                ? "bg-primary/20 text-primary font-semibold"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {intervalSecs > 0 && (
        <span className="text-[10px] text-muted-foreground">
          auto-refreshing
        </span>
      )}
    </div>
  );
}
