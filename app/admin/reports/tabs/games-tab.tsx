import { getGamePerformance } from "@/lib/actions/reports";

// Static fallback expected hold % per game type — only used for rounds placed
// before the effective/expected snapshot migration. Once expected_rtp is
// snapshotted per round, the table shows the true stake-weighted expected hold.
const EXPECTED_HOLD: Record<string, number> = {
  dice: 0.20,      // 20% minimum edge enforced by cap
  coinflip: 0.02,  // 2% fixed edge
  skyrise: 0.03,   // 3%
  mines: 0.05,     // 5%
  "hi-lo": 0.01,   // 1%
  limbo: 0.20,     // 20% minimum edge enforced by cap (same model as dice)
  "dragon-tower": 0.01, // 1% per-row formula edge (effective hold winPct-driven, like mines)
  "andar-bahar": 0.02,  // 2% fixed edge (even-money, like coinflip)
  plinko: 0.01,         // 1% paytable edge (effective hold winPct-driven via per-config cap)
  keno: 0.01,           // 1% paytable edge (effective hold winPct-driven via per-pick cap)
  "dragon-tiger": 0.05, // 5% portfolio edge (qMax cap over the D/T/Tie stake spread)
  "teen-patti": 0.05,   // 5% portfolio edge (qMax cap over the A/B/Pair-Plus stake spread)
};

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-PK", { maximumFractionDigits: decimals });
}

function pct(n: number) {
  return (n * 100).toFixed(2) + "%";
}

function HoldBadge({ realized, expected }: { realized: number; expected: number | undefined }) {
  if (expected == null) return <span>{pct(realized)}</span>;
  const diff = realized - expected;
  // Within 5pp = OK, negative = house losing
  const ok = realized >= 0 && Math.abs(diff) <= 0.10;
  const losing = realized < 0;
  return (
    <span
      title={`Expected ≈ ${pct(expected)} | Diff ${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(1)}pp`}
      className={`font-medium ${losing ? "text-red-400" : ok ? "text-green-400" : "text-yellow-400"}`}
    >
      {pct(realized)}
      {" "}
      <span className="text-[10px] opacity-60">
        (exp {pct(expected)})
      </span>
    </span>
  );
}

export async function GamesTab({ from, to }: { from: Date; to: Date }) {
  const rows = await getGamePerformance({ from, to });

  const totals = rows.reduce(
    (acc, r) => ({
      rounds: acc.rounds + r.rounds,
      players: acc.players + r.players,
      turnover: acc.turnover + r.turnover,
      ggr: acc.ggr + r.ggr,
      wins: acc.wins + r.wins,
    }),
    { rounds: 0, players: 0, turnover: 0, ggr: 0, wins: 0 }
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <span className="text-yellow-400">Hold % (exp ...)</span> = realized vs the
        stake-weighted theoretical hold snapshotted per round (falls back to a static
        per-game edge for pre-migration rounds). Green = within ±10pp, yellow = drifting,
        red = house losing. <span className="text-primary">Eff Win%</span> is the win
        probability the RNG actually used after house-edge caps — when it is far below
        Config Win%, the caps (not the tiers) are deciding outcomes for that game.
      </p>

      <div className="rounded-2xl border border-border/70 bg-card/80 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-left">Game</th>
              <th className="px-4 py-3 text-right">Rounds</th>
              <th className="px-4 py-3 text-right">Players</th>
              <th className="px-4 py-3 text-right">Turnover</th>
              <th className="px-4 py-3 text-right">GGR</th>
              <th className="px-4 py-3 text-right">Hold % (exp)</th>
              <th className="px-4 py-3 text-right">Win Freq</th>
              <th className="px-4 py-3 text-right">Avg Bet</th>
              <th className="px-4 py-3 text-right">Biggest Win</th>
              <th className="px-4 py-3 text-right">Avg Config Win%</th>
              <th className="px-4 py-3 text-right">Avg Eff Win%</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  No settled bets in this period
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.gameType} className="border-b border-border/30 hover:bg-accent/30">
                <td className="px-4 py-2.5 font-medium capitalize">{r.gameType}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(r.rounds)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(r.players)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">PKR {fmt(r.turnover)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.ggr >= 0 ? "text-green-400" : "text-red-400"}`}>
                  PKR {fmt(r.ggr)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <HoldBadge realized={r.holdPct} expected={r.expectedHoldPct ?? EXPECTED_HOLD[r.gameType]} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{pct(r.winFreq)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">PKR {fmt(r.avgBet, 0)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-yellow-400">PKR {fmt(r.biggestWin)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {r.avgWinProbability != null ? pct(r.avgWinProbability / 100) : <span className="text-xs opacity-50">pre-migration</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.avgEffectiveWinPct != null ? (
                    <span className={r.avgWinProbability != null && r.avgEffectiveWinPct < r.avgWinProbability - 1 ? "text-yellow-400" : "text-muted-foreground"}>
                      {pct(r.avgEffectiveWinPct / 100)}
                    </span>
                  ) : (
                    <span className="text-xs opacity-50">pre-migration</span>
                  )}
                </td>
              </tr>
            ))}

            {/* Totals row */}
            {rows.length > 0 && (
              <tr className="border-t border-border/50 bg-card font-semibold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totals.rounds)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">—</td>
                <td className="px-4 py-2.5 text-right tabular-nums">PKR {fmt(totals.turnover)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${totals.ggr >= 0 ? "text-green-400" : "text-red-400"}`}>
                  PKR {fmt(totals.ggr)}
                </td>
                <td className={`px-4 py-2.5 text-right ${totals.ggr >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {totals.turnover > 0 ? pct(totals.ggr / totals.turnover) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {totals.rounds > 0 ? pct(totals.wins / totals.rounds) : "—"}
                </td>
                <td colSpan={4} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
