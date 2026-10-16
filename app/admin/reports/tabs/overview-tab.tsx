import { getOverviewKpis } from "@/lib/actions/reports";
import type { Grain } from "../range-utils";
import { OverviewChart } from "./overview-chart";

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-PK", { maximumFractionDigits: decimals });
}

function pct(n: number) {
  return (n * 100).toFixed(1) + "%";
}

function delta(now: number, prev: number) {
  if (prev === 0) return null;
  const d = ((now - prev) / Math.abs(prev)) * 100;
  return d;
}

function DeltaBadge({ now, prev }: { now: number; prev: number }) {
  const d = delta(now, prev);
  if (d == null) return null;
  const up = d >= 0;
  return (
    <span
      className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        up ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
      }`}
    >
      {up ? "+" : ""}
      {d.toFixed(1)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  color,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  delta?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color ?? ""}`}>
        {value}
        {delta}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export async function OverviewTab({
  from,
  to,
  grain,
}: {
  from: Date;
  to: Date;
  grain: Grain;
}) {
  const kpis = await getOverviewKpis({ from, to });

  return (
    <div className="space-y-6">
      {/* KPI cards — row 1: revenue */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Revenue
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="GGR (House Win)"
            value={`PKR ${fmt(kpis.ggr)}`}
            color={kpis.ggr >= 0 ? "text-green-400" : "text-red-400"}
            delta={<DeltaBadge now={kpis.ggr} prev={kpis.prevGgr} />}
          />
          <KpiCard
            label="Turnover (Handle)"
            value={`PKR ${fmt(kpis.turnover)}`}
            delta={<DeltaBadge now={kpis.turnover} prev={kpis.prevTurnover} />}
          />
          <KpiCard
            label="Hold %"
            value={pct(kpis.holdPct)}
            sub="GGR ÷ Turnover"
            color={kpis.holdPct >= 0 ? "text-primary" : "text-red-400"}
          />
          <KpiCard
            label="Net Cash Flow"
            value={`PKR ${fmt(kpis.netCashFlow)}`}
            sub="Deposits − Withdrawals"
            color={kpis.netCashFlow >= 0 ? "text-green-400" : "text-red-400"}
          />
        </div>
      </div>

      {/* KPI cards — row 2: players */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Players
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Active Players (DAU)"
            value={fmt(kpis.dau)}
            delta={<DeltaBadge now={kpis.dau} prev={kpis.prevDau} />}
          />
          <KpiCard
            label="New Signups"
            value={fmt(kpis.newSignups)}
            delta={<DeltaBadge now={kpis.newSignups} prev={kpis.prevNewSignups} />}
          />
          <KpiCard
            label="Pending Withdrawals"
            value={fmt(kpis.pendingWithdrawalsCount)}
            sub={`PKR ${fmt(kpis.pendingWithdrawalsAmount)} liability`}
            color="text-yellow-400"
          />
          <KpiCard
            label="Open Liability"
            value={`PKR ${fmt(kpis.pendingWithdrawalsAmount)}`}
            sub="Pending withdrawal value"
            color="text-yellow-400"
          />
        </div>
      </div>

      {/* Trend chart */}
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
        <p className="mb-4 text-sm font-semibold">GGR & Turnover Trend</p>
        <OverviewChart data={kpis.trend} />
      </div>
    </div>
  );
}
