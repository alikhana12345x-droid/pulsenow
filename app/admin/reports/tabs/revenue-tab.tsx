import { getRevenueSeries } from "@/lib/actions/reports";
import type { Grain } from "../range-utils";
import { RevenueChart } from "./revenue-chart";

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-PK", { maximumFractionDigits: decimals });
}

function pct(n: number) {
  return (n * 100).toFixed(2) + "%";
}

export async function RevenueTab({
  from,
  to,
  grain,
}: {
  from: Date;
  to: Date;
  grain: Grain;
}) {
  const series = await getRevenueSeries({ from, to }, grain);

  const totalTurnover = series.reduce((s, r) => s + r.turnover, 0);
  const totalGgr = series.reduce((s, r) => s + r.ggr, 0);
  const totalRounds = series.reduce((s, r) => s + r.rounds, 0);
  const totalWins = series.reduce((s, r) => s + r.wins, 0);
  const holdPct = totalTurnover > 0 ? totalGgr / totalTurnover : 0;
  const winFreq = totalRounds > 0 ? totalWins / totalRounds : 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Turnover", value: `PKR ${fmt(totalTurnover)}` },
          { label: "GGR", value: `PKR ${fmt(totalGgr)}`, color: totalGgr >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Hold %", value: pct(holdPct), color: holdPct >= 0 ? "text-primary" : "text-red-400" },
          { label: "Total Rounds", value: fmt(totalRounds) },
          { label: "Player Win Rate", value: pct(winFreq) },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${color ?? ""}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* GGR trend chart */}
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
        <p className="mb-1 text-sm font-semibold">GGR & Hold % Over Time</p>
        <p className="mb-4 text-xs text-muted-foreground">
          GGR = Turnover − Payouts. Positive = house winning.
        </p>
        <RevenueChart data={series} grain={grain} />
      </div>

      {/* Data table */}
      <div className="rounded-2xl border border-border/70 bg-card/80 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-left">Period</th>
              <th className="px-4 py-3 text-right">Turnover</th>
              <th className="px-4 py-3 text-right">GGR</th>
              <th className="px-4 py-3 text-right">Hold %</th>
              <th className="px-4 py-3 text-right">Rounds</th>
              <th className="px-4 py-3 text-right">Player Win%</th>
            </tr>
          </thead>
          <tbody>
            {series.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No bets in this period
                </td>
              </tr>
            )}
            {series.map((row) => (
              <tr key={row.period} className="border-b border-border/30 hover:bg-accent/30">
                <td className="px-4 py-2.5 font-mono text-xs">{row.period.slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">PKR {fmt(row.turnover)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${row.ggr >= 0 ? "text-green-400" : "text-red-400"}`}>
                  PKR {fmt(row.ggr)}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${row.holdPct >= 0 ? "text-primary" : "text-red-400"}`}>
                  {pct(row.holdPct)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.rounds)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {row.rounds > 0 ? pct(row.wins / row.rounds) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
