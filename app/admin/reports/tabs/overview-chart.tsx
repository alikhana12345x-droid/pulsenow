"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "./chart-wrapper";

interface Point {
  period: string;
  ggr: number;
  turnover: number;
}

function shortDate(iso: string) {
  return iso.slice(5, 10); // "MM-DD"
}

function fmtPKR(v: number) {
  if (Math.abs(v) >= 1_000_000) return `PKR ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `PKR ${(v / 1_000).toFixed(0)}k`;
  return `PKR ${v.toFixed(0)}`;
}

export function OverviewChart({ data }: { data: Point[] }) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No data for the selected range
      </div>
    );
  }

  const display = data.map((d) => ({ ...d, period: shortDate(d.period) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={display} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ggrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="turnoverGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11, fill: "rgba(255,255,255,0.45)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtPKR}
          tick={{ fontSize: 11, fill: "rgba(255,255,255,0.45)" }}
          axisLine={false}
          tickLine={false}
          width={70}
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
        <Area
          type="monotone"
          dataKey="turnover"
          name="Turnover"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#turnoverGrad)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="ggr"
          name="GGR"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#ggrGrad)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
