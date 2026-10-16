import type { getAdminGames } from "@/lib/actions/game-admin";
import { EditGameButton, StatusSelect, FeaturedToggle } from "./game-actions";

type Game = Awaited<ReturnType<typeof getAdminGames>>[0];

export function GamesTable({ games }: { games: Game[] }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Lobby Games</p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">
          Controls what the lobby shows and whether a game can be played. Game logic stays in code —
          a <span className="font-mono">slug</span> with no matching code is ignored. Status, order,
          labels, featured, and images are all editable here.
        </p>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-border/70 bg-card/80">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Game</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Featured</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Payout</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr
                  key={game.id}
                  className={`border-b border-border/40 last:border-0 transition-colors hover:bg-accent/30 ${game.status === "hidden" ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{game.sort_order}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{game.emoji}</span>
                      <div>
                        <p className="font-medium">{game.title}</p>
                        <p className="font-mono text-[11px] text-muted-foreground/60">{game.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusSelect id={game.id} status={game.status} /></td>
                  <td className="px-4 py-3"><FeaturedToggle id={game.id} featured={game.featured} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{game.payout_label ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <EditGameButton game={game} />
                    </div>
                  </td>
                </tr>
              ))}

              {games.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                    No games yet. Run <span className="font-mono">npm run db:seed-games</span> to populate the registry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/50 px-4 py-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground/70">Statuses: </span>
        <span className="text-green-400">Live</span> = playable ·{" "}
        <span className="text-sky-400">Coming Soon</span> &amp; <span className="text-yellow-400">Maintenance</span> = shown greyed, not playable ·{" "}
        Hidden = not shown at all. Changes propagate to the lobby within 60 seconds. Rounds already in
        progress can always be finished even after a game goes to maintenance.
      </div>
    </div>
  );
}
