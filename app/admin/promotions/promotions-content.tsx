import { getPromotionStats, getPromotionPlayerStats } from "@/lib/actions/promotions";
import { PlatformPromotions } from "./platform-promotions";
import { PromotionPlayers } from "./promotion-players";
import { PromotionsTabs } from "./promotions-tabs";

export async function PromotionsContent() {
  const [promoStats, playerStats] = await Promise.all([
    getPromotionStats(),
    getPromotionPlayerStats(),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">Admin Panel</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Promotions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {promoStats.active}/{promoStats.total} active promotions &middot; {playerStats.active} promo players
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Promotions" value={String(promoStats.total)} />
        <StatCard label="Active Promotions" value={String(promoStats.active)} accent="green" />
        <StatCard label="Promo Players" value={String(playerStats.total)} />
        <StatCard label="Active Players" value={String(playerStats.active)} accent="amber" />
      </div>

      {/* Tabs */}
      <PromotionsTabs
        platformTab={<PlatformPromotions />}
        playersTab={<PromotionPlayers />}
      />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "green" | "amber" }) {
  const valueClass = accent === "green"
    ? "text-green-400"
    : accent === "amber"
    ? "text-bp-accent"
    : "text-foreground";

  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}
