"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "./chart-wrapper";
import type { Grain } from "../range-utils";

interface Point {
  period: string;
  turnover: number;
  ggr: number;
  holdPct: number;
  rounds: number;
  wins: number;
}

function fmtLabel(iso: string, grain: Grain) {
  if (grain === "hour") return iso.slice(5, 16).replace("T", " ");
  if (grain === "week") return iso.slice(0, 10);
  return iso.slice(5, 10);
}

function fmtPKR(v: number) {
  if (Math.abs(v) >= 1_000_000) return `PKR ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `PKR ${(v / 1_000).toFixed(0)}k`;
  return `PKR ${v.toFixed(0)}`;
}

export function RevenueChart({ data, grain }: { data: Point[]; grain: Grain }) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No data for the selected range
      </div>
    );
  }

  const display = data.map((d) => ({
    ...d,
    period: fmtLabel(d.period, grain),
    holdPct: parseFloat((d.holdPct * 100).toFixed(2)),
  }));

  return (
    <div className="space-y-4">
      {/* GGR bar chart */}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={display} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmtPKR}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
            axisLine={false}
            tickLine={false}
            width={68}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v, name) => [fmtPKR(Number(v ?? 0)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="turnover" name="Turnover" fill="#3b82f6" opacity={0.7} radius={[3, 3, 0, 0]} />
          <Bar dataKey="ggr" name="GGR" fill="#22c55e" opacity={0.85} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Hold % line */}
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={display} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => v + "%"}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => [Number(v ?? 0).toFixed(2) + "%", "Hold %"]}
          />
          <Line
            type="monotone"
            dataKey="holdPct"
            name="Hold %"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
