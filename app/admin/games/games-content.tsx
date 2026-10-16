import { getAdminGames } from "@/lib/actions/game-admin";
import { GamesTable } from "./games-table";

export async function GamesContent() {
  const games = await getAdminGames();
  const live = games.filter((g) => g.status === "live").length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">Admin Panel</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Games</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {live} live &middot; {games.length} total &middot; controls the lobby &amp; what players can open
        </p>
      </div>

      <GamesTable games={games} />
    </div>
  );
}
