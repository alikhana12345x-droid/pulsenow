"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Preset, Grain, ReportDateRange } from "./range-utils";

export type { Preset, Grain, ReportDateRange };

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "month", label: "This month" },
];

const GRAINS: { value: Grain; label: string }[] = [
  { value: "hour", label: "Hourly" },
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
];

export function DateRangePicker({ range }: { range: ReportDateRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const push = useCallback(
    (updates: Partial<Record<string, string>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (!v) next.delete(k);
        else next.set(k, v);
      }
      router.push(`${pathname}?${next.toString()}`);
    },
    [router, pathname, params]
  );

  const setPreset = (p: Preset) => {
    const updates: Record<string, string> = { preset: p };
    if (p !== "custom") { updates.from = ""; updates.to = ""; }
    push(updates);
  };

  const setGrain = (g: Grain) => push({ grain: g });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset buttons */}
      <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-card/80 p-1">
        {PRESETS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPreset(value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              range.preset === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setPreset("custom")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            range.preset === "custom"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          Custom
        </button>
      </div>

      {/* Custom date inputs */}
      {range.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => push({ from: e.target.value, preset: "custom" })}
            className="rounded-lg border border-border/70 bg-card/80 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) => push({ to: e.target.value, preset: "custom" })}
            className="rounded-lg border border-border/70 bg-card/80 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {/* Granularity toggle */}
      <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-card/80 p-1">
        {GRAINS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setGrain(value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              range.grain === value
                ? "bg-primary/20 text-primary font-semibold"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Range label */}
      <span className="text-xs text-muted-foreground">
        {range.from === range.to ? range.from : `${range.from} → ${range.to}`}
      </span>
    </div>
  );
}
