import { getValidationReport } from "@/lib/actions/reports";

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-PK", { maximumFractionDigits: decimals });
}

function pctFmt(n: number) {
  return (n * 100).toFixed(2) + "%";
}

function PassFailBadge({
  value,
  rounds,
}: {
  value: boolean | null;
  rounds: number;
}) {
  if (value == null) {
    const reason = rounds < 30 ? `< 30 rounds` : "no snapshot";
    // rounds here = decided rounds (engine decisions recorded for this group)
    return (
      <span className="rounded-full bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
        N/A ({reason})
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
        value
          ? "bg-green-500/20 text-green-400"
          : "bg-red-500/20 text-red-400"
      }`}
    >
      {value ? "PASS" : "FAIL"}
    </span>
  );
}

export async function ValidationTab({ from, to }: { from: Date; to: Date }) {
  const rows = await getValidationReport({ from, to });

  // Separate promo from normal
  const normalRows = rows.filter((r) => !r.isPromo);
  const promoRows = rows.filter((r) => r.isPromo);

  const totalRounds = rows.reduce((s, r) => s + r.rounds, 0);
  const passes = rows.filter((r) => r.withinTolerance === true).length;
  const fails = rows.filter((r) => r.withinTolerance === false).length;

  return (
    <div className="space-y-6">
      {/* Header + summary */}
      <div>
        <p className="text-xs text-muted-foreground max-w-3xl">
          Tests whether the RNG honours the win probability it was given.{" "}
          <span className="text-primary font-medium">Eff Win%</span> is the probability
          the engine actually used after house-edge caps (Config Win% is the raw tier
          setting — caps lower it when the player picks a high multiplier).{" "}
          <span className="text-primary font-medium">Engine Win Freq</span> counts the
          engine&apos;s own win/loss decisions. PASS = Engine Win Freq within ±5pp of Eff
          Win% over ≥ 30 rounds. Realized vs Expected RTP is informational: player-skill
          games (Skyrise, Mines, Tower, Hi-Lo) realize BELOW their expected RTP because
          players cash out early or bust winnable rounds. Rounds placed before the
          effective-snapshot migration (0008) show N/A.
        </p>

        {totalRounds > 0 && (passes > 0 || fails > 0) && (
          <div className="mt-3 flex gap-3">
            <span className="rounded-full bg-green-500/15 px-3 py-1 text-sm font-medium text-green-400">
              {passes} PASS
            </span>
            <span className="rounded-full bg-red-500/15 px-3 py-1 text-sm font-medium text-red-400">
              {fails} FAIL
            </span>
            <span className="rounded-full bg-muted/30 px-3 py-1 text-sm font-medium text-muted-foreground">
              {rows.filter((r) => r.withinTolerance === null).length} N/A
            </span>
          </div>
        )}
      </div>

      {/* Normal players table */}
      <ValidationTable title="Normal Players" rows={normalRows} />

      {/* Promo players table */}
      {promoRows.length > 0 && (
        <ValidationTable title="Promo Players" rows={promoRows} isPromo />
      )}

      {rows.length === 0 && (
        <div className="rounded-2xl border border-border/70 bg-card/80 py-12 text-center text-sm text-muted-foreground">
          No settled bets in this date range
        </div>
      )}
    </div>
  );
}

function ValidationTable({
  title,
  rows,
  isPromo,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof getValidationReport>>;
  isPromo?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
        {isPromo && (
          <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary normal-case tracking-normal">
            PROMO
          </span>
        )}
      </p>
      <div className="rounded-2xl border border-border/70 bg-card/80 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-left">Game</th>
              <th className="px-4 py-3 text-right">Config Win%</th>
              <th className="px-4 py-3 text-right">Eff Win%</th>
              <th className="px-4 py-3 text-right">Rounds</th>
              <th className="px-4 py-3 text-right">Engine Win Freq</th>
              <th className="px-4 py-3 text-right">Paid Win Freq</th>
              <th className="px-4 py-3 text-right">Turnover</th>
              <th className="px-4 py-3 text-right">Payout</th>
              <th className="px-4 py-3 text-right">House P/L</th>
              <th className="px-4 py-3 text-right">Realized RTP</th>
              <th className="px-4 py-3 text-right">Expected RTP</th>
              <th className="px-4 py-3 text-center">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-6 text-center text-muted-foreground">
                  No data
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr
                key={`${r.gameType}-${r.winProbability}-${i}`}
                className={`border-b border-border/30 hover:bg-accent/30 ${
                  r.withinTolerance === false ? "bg-red-500/5" : ""
                }`}
              >
                <td className="px-4 py-2.5 font-medium capitalize">{r.gameType}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.winProbability != null ? (
                    <span className="text-primary font-medium">{r.winProbability.toFixed(1)}%</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">pre-migration</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.effectiveWinPct != null ? (
                    <span
                      className={
                        r.winProbability != null && r.effectiveWinPct < r.winProbability - 1
                          ? "text-yellow-400 font-medium"
                          : "font-medium"
                      }
                    >
                      {r.effectiveWinPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(r.rounds)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  {r.engineWinFreq != null ? pctFmt(r.engineWinFreq) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {pctFmt(r.winFreq)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">PKR {fmt(r.turnover)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">PKR {fmt(r.totalPayout)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.housePnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  PKR {fmt(r.housePnl)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{pctFmt(r.realizedRtp)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {r.expectedRtp != null ? pctFmt(r.expectedRtp) : "—"}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <PassFailBadge value={r.withinTolerance} rounds={r.decidedRounds} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
