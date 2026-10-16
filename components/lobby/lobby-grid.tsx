"use client";

import { Coins, ShieldCheck } from "lucide-react";
import { FinanceDrawerTrigger } from "@/components/protected/finance-drawer-trigger";
import { BannerSlider } from "@/components/promotions/banner-slider";
import { LobbyPromotionToasts } from "@/components/promotions/lobby-promotion-toasts";
import { LobbyPromotionModals } from "@/components/promotions/promotion-modal-client";
import { CARD_ART } from "@/components/protected/game-card-art";
import { type GameSlug, type RegistryGame } from "@/lib/games-catalogue";

type BannerPromos = React.ComponentProps<typeof BannerSlider>["promos"];
type ToastPromos = React.ComponentProps<typeof LobbyPromotionToasts>["toasts"];
type ModalPromos = React.ComponentProps<typeof LobbyPromotionModals>["modals"];

function GameArt({ game }: { game: RegistryGame }) {
  // Admin-uploaded image overrides the coded SVG art when present.
  if (game.cardImageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={game.cardImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />;
  }
  const Art = CARD_ART[game.slug];
  return Art ? <Art /> : null;
}

export function LobbyGrid({
  games,
  betCount,
  totalWagered,
  banner,
  toast,
  modal,
  onSelectGame,
}: {
  games: RegistryGame[];
  betCount: number;
  totalWagered: number;
  banner: BannerPromos;
  toast: ToastPromos;
  modal: ModalPromos;
  onSelectGame: (slug: GameSlug) => void;
}) {
  const liveGames = games.filter((g) => g.status === "live");
  // Any number of games can be featured (admin-controlled) — each renders as a
  // full hero card, stacked in sort_order. Falls back to the first live game so
  // the hero slot is never empty when nothing is explicitly featured.
  const explicitlyFeatured = liveGames.filter((g) => g.featured);
  const featuredGames = explicitlyFeatured.length > 0 ? explicitlyFeatured : liveGames.slice(0, 1);
  const featuredSlugs = new Set(featuredGames.map((g) => g.slug));
  const gridGames = liveGames.filter((g) => !featuredSlugs.has(g.slug));
  // coming_soon + maintenance are shown greyed and are NOT playable.
  const soonGames = games.filter((g) => g.status === "coming_soon" || g.status === "maintenance");

  return (
    <div className="flex-1 space-y-5 px-4 pt-4 pb-4">

      {/* ── Live stats ticker ── */}
      {/* Pills stretch to fill wide screens and scroll sideways on narrow ones. */}
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <StatChip
          label="Bets today"
          marker={<LiveDot />}
          value={betCount.toLocaleString("en-PK")}
        />
        <StatChip
          label="Wagered"
          marker={<Coins className="h-3 w-3 text-bp-accent" strokeWidth={2.5} />}
          prefix="PKR"
          value={
            totalWagered >= 1_000_000
              ? `${(totalWagered / 1_000_000).toFixed(1)}M`
              : totalWagered >= 1_000
                ? `${(totalWagered / 1_000).toFixed(0)}K`
                : totalWagered.toLocaleString("en-PK")
          }
        />
        <StatChip
          label="House edge"
          marker={<ShieldCheck className="h-3 w-3 text-bp-win" strokeWidth={2.5} />}
          value="1%"
        />
      </div>

      {/* ── Promo banner ── */}
      {banner.length > 0 ? (
        <BannerSlider promos={banner} />
      ) : (
        <div className="relative overflow-hidden rounded-[24px] border border-bp-accent/25 bg-[radial-gradient(ellipse_at_top_right,rgba(242,154,11,0.28),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(120,80,220,0.2),transparent_50%),linear-gradient(160deg,#1c0d00,#100d1e_55%,#090714)]">
          <div className="pointer-events-none absolute -right-2 top-0 select-none font-bp-mono text-[100px] font-black leading-none text-bp-accent/[0.055]">
            100%
          </div>
          <div className="pointer-events-none absolute -bottom-8 -right-8 h-36 w-36 rounded-full border border-bp-accent/[0.08]" />
          <div className="pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 rounded-full border border-bp-accent/[0.06]" />
          <div className="relative z-10 p-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-bp-accent/35 bg-bp-accent/10 px-2.5 py-1 font-bp-mono text-[10px] font-bold uppercase tracking-widest text-bp-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-bp-accent" />
              Welcome Bonus
            </span>
            <h2 className="mt-3 text-[22px] font-black leading-tight tracking-tight text-bp-text">
              100% match on your
              <br />
              first deposit
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-white/40">
              Deposit now and we&apos;ll double it instantly.
              <br />
              No wagering requirement.
            </p>
            <div className="mt-4 flex items-center gap-2.5">
              <FinanceDrawerTrigger
                action="deposit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-bp-accent to-[#c97e08] px-5 py-2.5 font-bp-ui text-[13px] font-black text-[#1b1305] shadow-[0_3px_14px_rgba(242,154,11,0.45)] transition-all hover:opacity-90 active:scale-[0.98]"
              >
                Deposit now →
              </FinanceDrawerTrigger>
              <FinanceDrawerTrigger
                action="withdraw"
                className="inline-flex items-center rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-2.5 font-bp-ui text-[13px] font-semibold text-white/55 transition-colors hover:border-white/20 hover:text-white/80"
              >
                Withdraw
              </FinanceDrawerTrigger>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast / modal promotions ── */}
      {toast.length > 0 && <LobbyPromotionToasts toasts={toast} />}
      {modal.length > 0 && <LobbyPromotionModals modals={modal} />}

      {/* ── Games section ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/45">
              Live Games
            </span>
            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 font-bp-mono text-[10px] font-bold text-white/35">
              {liveGames.length}
            </span>
          </div>
          <span className="text-[11px] text-white/20">House edge 1%</span>
        </div>

        {/* Featured games — one hero card per featured game, stacked */}
        {featuredGames.length > 0 && (
          <div className="space-y-3">
            {featuredGames.map((featuredGame) => (
              <button
                key={featuredGame.slug}
                type="button"
                onClick={() => onSelectGame(featuredGame.slug)}
                className="group relative block w-full overflow-hidden rounded-[22px] border border-white/[0.08] text-left transition-all duration-200 hover:border-white/[0.18] hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
              >
                <div className={`bg-gradient-to-br ${featuredGame.gradient} relative h-52 overflow-hidden`}>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{ background: `radial-gradient(circle at 65% 45%, ${featuredGame.glow ?? "transparent"}, transparent 58%)` }}
                  />
                  <div className="absolute inset-0">
                    <GameArt game={featuredGame} />
                  </div>
                  <div className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 font-bp-mono text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-sm">
                    Featured
                  </div>
                  <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-green-500/20 px-2.5 py-1 backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                    <span className="font-bp-mono text-[10px] font-bold uppercase text-green-400">Live</span>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-bp-mid px-4 py-4 border-t border-white/[0.05]">
                  <div>
                    <p className="text-[15px] font-bold text-bp-text">{featuredGame.title}</p>
                    <p className="mt-0.5 text-[11px] text-white/40">{featuredGame.subtitle}</p>
                  </div>
                  {featuredGame.payoutLabel && (
                    <div className="text-right">
                      <p className="font-bp-mono text-[13px] font-bold text-bp-accent">{featuredGame.payoutLabel}</p>
                      <p className="mt-0.5 text-[10px] text-white/30">Max payout</p>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 2-col grid */}
        <div className="grid grid-cols-2 gap-3">
          {gridGames.map((game) => {
            const isNew = game.badge === "NEW";
            return (
              <button
                key={game.slug}
                type="button"
                onClick={() => onSelectGame(game.slug)}
                className="group relative block w-full overflow-hidden rounded-[20px] border border-white/[0.07] text-left transition-all duration-200 hover:border-white/[0.18] hover:shadow-[0_8px_28px_rgba(0,0,0,0.55)]"
              >
                <div className={`bg-gradient-to-br ${game.gradient} relative h-36 overflow-hidden`}>
                  {game.glow && (
                    <div
                      className="pointer-events-none absolute inset-0 opacity-70"
                      style={{ background: `radial-gradient(circle at 55% 45%, ${game.glow}, transparent 60%)` }}
                    />
                  )}
                  <div className="absolute inset-0">
                    <GameArt game={game} />
                  </div>
                  <div className={`absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 backdrop-blur-sm ${isNew ? "bg-amber-500/20" : "bg-green-500/20"}`}>
                    <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${isNew ? "bg-amber-400" : "bg-green-400"}`} />
                    <span className={`font-bp-mono text-[9px] font-bold uppercase ${isNew ? "text-amber-400" : "text-green-400"}`}>
                      {game.badge ?? "Live"}
                    </span>
                  </div>
                </div>
                <div className="bg-bp-mid px-3 py-3 border-t border-white/[0.04]">
                  <p className="text-[13px] font-bold text-bp-text capitalize">{game.title}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-[10px] text-white/40 truncate pr-2">{game.subtitle}</p>
                    {game.payoutLabel && <p className="shrink-0 font-bp-mono text-[11px] font-bold text-bp-accent">{game.payoutLabel}</p>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Coming soon / under maintenance (greyed, not playable) ── */}
      {soonGames.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-white/15" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/25">
              Unavailable
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {soonGames.map((game) => {
              const label = game.status === "maintenance" ? "Maintenance" : "Soon";
              return (
                <div
                  key={game.slug}
                  className="relative overflow-hidden rounded-[18px] border border-white/[0.04] opacity-55"
                >
                  <div className={`bg-gradient-to-br ${game.gradient} relative flex h-32 items-center justify-center grayscale`}>
                    <span className="relative z-10 select-none text-5xl opacity-50">{game.emoji}</span>
                    <div className="absolute right-2 top-2 rounded-full bg-white/10 px-2 py-0.5 backdrop-blur-sm">
                      <span className="font-bp-mono text-[9px] font-bold uppercase text-white/45">{label}</span>
                    </div>
                  </div>
                  <div className="bg-bp-mid px-3 py-3">
                    <p className="text-[13px] font-bold text-white/45">{game.title}</p>
                    <p className="mt-1 text-[10px] text-white/25">
                      {game.status === "maintenance" ? "Temporarily unavailable" : game.subtitle}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
    </span>
  );
}

function StatChip({
  label,
  value,
  prefix,
  marker,
}: {
  label: string;
  value: string;
  prefix?: string;
  marker: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      {marker}
      <span className="text-[10px] font-medium text-white/45">{label}</span>
      <span className="flex items-baseline gap-0.5 font-bp-mono text-[12px] font-black leading-none tabular-nums text-bp-text">
        {prefix && <span className="text-[8px] font-bold text-white/35">{prefix}</span>}
        {value}
      </span>
    </div>
  );
}
