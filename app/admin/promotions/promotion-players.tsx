import { getPromotionPlayers } from "@/lib/actions/promotions";
import {
  AddPromotionPlayerButton,
  EditPromotionPlayerButton,
  TogglePromotionPlayerButton,
  RemovePromotionPlayerButton,
} from "./promotion-actions";
import { APP_TIME_ZONE } from "@/lib/time";

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric", timeZone: APP_TIME_ZONE });
}

export async function PromotionPlayers() {
  const players = await getPromotionPlayers();

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{players.length} player{players.length !== 1 ? "s" : ""} in promotion pool</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">Active promo players receive a win probability boost during ad campaigns.</p>
        </div>
        <AddPromotionPlayerButton />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[24px] border border-border/70 bg-card/80">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Player</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Win Boost</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Notes</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Added</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-border/40 transition-colors last:border-0 hover:bg-accent/30 ${!p.is_active ? "opacity-60" : ""}`}
                >
                  {/* Player info */}
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{p.username ?? <span className="italic text-muted-foreground">no username</span>}</p>
                      {p.display_name && (
                        <p className="text-xs text-muted-foreground">{p.display_name}</p>
                      )}
                    </div>
                  </td>

                  {/* Win boost */}
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${
                      Number(p.win_probability_boost) > 0
                        ? "bg-bp-win/15 text-bp-win"
                        : "bg-secondary text-muted-foreground"
                    }`}>
                      +{Number(p.win_probability_boost).toFixed(1)}%
                    </span>
                  </td>

                  {/* Notes */}
                  <td className="px-4 py-3 max-w-[200px] truncate text-muted-foreground text-xs">
                    {p.notes ?? <span className="italic">—</span>}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      p.is_active
                        ? "bg-green-500/20 text-green-400"
                        : "bg-secondary text-muted-foreground"
                    }`}>
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">{fmt(p.created_at)}</td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <EditPromotionPlayerButton
                        id={p.id}
                        currentBoost={Number(p.win_probability_boost)}
                        currentNotes={p.notes ?? ""}
                      />
                      <TogglePromotionPlayerButton id={p.id} isActive={p.is_active} />
                      <RemovePromotionPlayerButton id={p.id} username={p.username ?? "this player"} />
                    </div>
                  </td>
                </tr>
              ))}

              {players.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                    No promotion players yet. Click &ldquo;Add Player&rdquo; to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info callout */}
      <div className="rounded-2xl border border-bp-accent/20 bg-bp-accent/5 px-4 py-3 text-xs text-bp-accent/80">
        <span className="font-semibold text-bp-accent">How it works: </span>
        Promotion players are flagged in the game engine. During active ad campaigns their win probability is boosted by the configured percentage. Disable them at any time without removing them from the pool.
      </div>
    </div>
  );
}
