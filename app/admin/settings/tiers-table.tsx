import type { getTiers } from "@/lib/actions/game-settings";
import { UNCAPPED_TIER_THRESHOLD } from "@/lib/player-win-probability";
import {
  CreateTierButton,
  EditTierButton,
  ToggleTierButton,
  DeleteTierButton,
} from "./tier-actions";

type Tier = Awaited<ReturnType<typeof getTiers>>[0];

export function TiersTable({ tiers }: { tiers: Tier[] }) {
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Bet Amount Tiers</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            Tiers are evaluated in order. First matching range wins. Promotion-player boosts override all tiers.
          </p>
        </div>
        <CreateTierButton nextOrder={tiers.length} />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[24px] border border-border/70 bg-card/80">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Label</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Min (PKR)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Max (PKR)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Win %</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, i) => (
                <tr
                  key={tier.id}
                  className={`border-b border-border/40 last:border-0 transition-colors hover:bg-accent/30 ${!tier.is_active ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{tier.label}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(tier.min_amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(tier.max_amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${
                      tier.win_probability >= 30 ? "bg-bp-win/15 text-bp-win" :
                      tier.win_probability >= 10 ? "bg-yellow-500/15 text-yellow-400" :
                      "bg-red-500/15 text-red-400"
                    }`}>
                      {tier.win_probability}%
                    </span>
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
                      {tier.win_probability > UNCAPPED_TIER_THRESHOLD ? "Exact · no cap" : "House-capped"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      tier.is_active
                        ? "bg-green-500/20 text-green-400"
                        : "bg-secondary text-muted-foreground"
                    }`}>
                      {tier.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <EditTierButton tier={tier} />
                      <ToggleTierButton id={tier.id} isActive={tier.is_active} />
                      <DeleteTierButton id={tier.id} label={tier.label} />
                    </div>
                  </td>
                </tr>
              ))}

              {tiers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    No tiers yet. Click &ldquo;+ Add Tier&rdquo; to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info callout */}
      <div className="rounded-2xl border border-border/40 bg-card/50 px-4 py-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground/70">Fallback: </span>
        If a bet amount falls outside all active tiers, the engine defaults to{" "}
        <span className="font-mono font-semibold text-foreground/70">20%</span> win probability.
        Changes propagate within 60 seconds via the in-memory cache.
      </div>
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-xs text-muted-foreground">
        <span className="font-semibold text-amber-400">House-edge cap: </span>
        Tiers at {UNCAPPED_TIER_THRESHOLD}% or below are capped per game so the house keeps its edge
        (e.g. 40% on a 2× Aviator auto cash-out plays as 40%, but on a 5× target as 19.4%).
        Tiers above {UNCAPPED_TIER_THRESHOLD}% are honoured exactly, like a promotion boost — the house
        can lose money on those bets, especially on high-multiplier picks (Limbo, Dice, Hi-Lo, Aviator targets).
      </div>
    </div>
  );
}
