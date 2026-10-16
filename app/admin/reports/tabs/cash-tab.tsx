import { getCashFlow, getPendingLiability } from "@/lib/actions/reports";
import { CashFlowChart } from "./cash-flow-chart";

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-PK", { maximumFractionDigits: decimals });
}

function pct(n: number) {
  return (n * 100).toFixed(1) + "%";
}

export async function CashTab({ from, to }: { from: Date; to: Date }) {
  const [cash, liability] = await Promise.all([
    getCashFlow({ from, to }),
    getPendingLiability(),
  ]);

  return (
    <div className="space-y-6">
      {/* Liability banner — always shown, not date-bounded */}
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
          Live Pending Liability
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground mb-3">
          What the platform owes right now — not date-filtered.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Total Liability", value: `PKR ${fmt(liability.total)}`, color: "text-yellow-400 text-2xl" },
            { label: "Player Balances", value: `PKR ${fmt(liability.walletBalances)}`, color: "text-foreground" },
            { label: "Unsettled Rounds", value: `PKR ${fmt(liability.openRoundsValue)}`, color: "text-foreground" },
            { label: "Pending Withdrawals", value: `PKR ${fmt(liability.pendingWithdrawals)}`, color: "text-foreground" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`mt-0.5 font-bold tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Net cash flow KPIs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Cash Flow (selected range)
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
            <p className="text-xs text-muted-foreground">Confirmed Deposits</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-green-400">PKR {fmt(cash.totalDeposits)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{fmt(cash.depositCount)} transactions</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
            <p className="text-xs text-muted-foreground">Processed Withdrawals</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-red-400">PKR {fmt(cash.totalWithdrawals)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{fmt(cash.withdrawalCount)} transactions</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
            <p className="text-xs text-muted-foreground">Net Cash Flow</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${cash.netCashFlow >= 0 ? "text-green-400" : "text-red-400"}`}>
              PKR {fmt(cash.netCashFlow)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Deposits − Withdrawals</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
            <p className="text-xs text-muted-foreground">Pending Deposits</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-yellow-400">{fmt(cash.pendingDeposits)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">PKR {fmt(cash.pendingDepositsAmount)} awaiting</p>
          </div>
        </div>
      </div>

      {/* Funnel */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Transaction Funnels
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
            <p className="text-sm font-semibold mb-3">Deposit Funnel</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Initiated</span>
                <span className="font-mono">
                  {fmt(cash.depositCount > 0
                    ? Math.round(cash.depositCount / cash.depositSuccessRate)
                    : cash.depositCount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Confirmed</span>
                <span className="font-mono text-green-400">{fmt(cash.depositCount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Success rate</span>
                <span className={`font-bold ${cash.depositSuccessRate >= 0.8 ? "text-green-400" : "text-yellow-400"}`}>
                  {pct(cash.depositSuccessRate)}
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
            <p className="text-sm font-semibold mb-3">Withdrawal Funnel</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Requested</span>
                <span className="font-mono">
                  {fmt(cash.withdrawalCount > 0
                    ? Math.round(cash.withdrawalCount / Math.max(0.01, cash.withdrawalSuccessRate))
                    : cash.withdrawalCount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Processed</span>
                <span className="font-mono text-green-400">{fmt(cash.withdrawalCount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Pending</span>
                <span className="font-mono text-yellow-400">{fmt(cash.pendingWithdrawals)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Success rate</span>
                <span className={`font-bold ${cash.withdrawalSuccessRate >= 0.8 ? "text-green-400" : "text-yellow-400"}`}>
                  {pct(cash.withdrawalSuccessRate)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cash flow chart */}
      {cash.series.length > 0 && (
        <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
          <p className="mb-1 text-sm font-semibold">Daily Cash Flow</p>
          <p className="mb-4 text-xs text-muted-foreground">
            Confirmed deposits vs processed withdrawals per day.
          </p>
          <CashFlowChart data={cash.series} />
        </div>
      )}
    </div>
  );
}
