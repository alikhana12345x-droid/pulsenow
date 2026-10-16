"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "./chart-wrapper";

interface Point {
  period: string;
  deposits: number;
  withdrawals: number;
  net: number;
}

function fmtPKR(v: number) {
  if (Math.abs(v) >= 1_000_000) return `PKR ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `PKR ${(v / 1_000).toFixed(0)}k`;
  return `PKR ${v.toFixed(0)}`;
}

export function CashFlowChart({ data }: { data: Point[] }) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No transactions in this period
      </div>
    );
  }

  const display = data.map((d) => ({ ...d, period: d.period.slice(5, 10) }));

  return (
    <ResponsiveContainer width="100%" height={240}>
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
        <Bar dataKey="deposits" name="Deposits" fill="#22c55e" opacity={0.8} radius={[3, 3, 0, 0]} />
        <Bar dataKey="withdrawals" name="Withdrawals" fill="#ef4444" opacity={0.7} radius={[3, 3, 0, 0]} />
        <Bar dataKey="net" name="Net" fill="#3b82f6" opacity={0.7} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
