import { count, eq, gte, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { bets, profiles } from "@/lib/supabase/schema";
import { getOrCreateWallet } from "@/lib/actions/wallet";
import { getActiveLobbyPromotions } from "@/lib/actions/promotions";
import { LobbyExperience } from "@/components/lobby/lobby-experience";
import { isGameSlug } from "@/lib/games-catalogue";
import { getLobbyGames } from "@/lib/games-registry";

// Cached lobby stats (revalidates every 60 s) — public, no auth needed.
const getTodayBetStats = unstable_cache(
  async (dateKey: string) => {
    void dateKey;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return db
      .select({
        betCount: count(),
        totalWagered: sql<string>`coalesce(sum(amount)::numeric(14,0), 0)::text`,
      })
      .from(bets)
      .where(gte(bets.created_at, todayStart))
      .catch(() => null);
  },
  ["lobby-today-bet-stats"],
  { revalidate: 60 },
);

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ game?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  const email = data?.claims?.email as string | undefined;
  const isLoggedIn = Boolean(userId);

  const gameParam = (await searchParams)?.game;
  const initialGame = isGameSlug(gameParam) ? gameParam : null;

  const todayKey = new Date().toISOString().slice(0, 10);
  const [todayStatsRes, activePromos, lobbyGames] = await Promise.all([
    getTodayBetStats(todayKey),
    getActiveLobbyPromotions().catch(() => []),
    getLobbyGames(), // falls back to the static catalogue if the table is empty/unavailable
  ]);

  const betCount = Number(todayStatsRes?.[0]?.betCount ?? 0);
  const totalWagered = Number(todayStatsRes?.[0]?.totalWagered ?? 0);

  const banner = activePromos.filter((p) => p.type === "banner");
  const toast = activePromos.filter((p) => p.type === "toast");
  const modal = activePromos.filter((p) => p.type === "modal");

  // Logged-in players get their wallet balance + display name up front so the
  // SPA game views can mount without an extra server round-trip.
  let serverBalance = 0;
  let userName: string | undefined;
  let avatarUrl: string | undefined;
  if (userId) {
    const [wallet, profileRow] = await Promise.all([
      getOrCreateWallet(userId),
      db
        .select({ display_name: profiles.display_name, username: profiles.username, avatar_url: profiles.avatar_url })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);
    serverBalance = Number(wallet.balance);
    userName = profileRow?.display_name ?? profileRow?.username ?? undefined;
    avatarUrl = profileRow?.avatar_url ?? undefined;
  }

  return (
    <LobbyExperience
      isLoggedIn={isLoggedIn}
      email={email}
      initialGame={initialGame}
      serverBalance={serverBalance}
      userName={userName}
      avatarUrl={avatarUrl}
      betCount={betCount}
      totalWagered={totalWagered}
      promos={{ banner, toast, modal }}
      games={lobbyGames}
    />
  );
}
