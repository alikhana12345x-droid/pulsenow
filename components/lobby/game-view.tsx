"use client";

import dynamic from "next/dynamic";
import type { GameSlug } from "@/lib/games-catalogue";
import { gameTitle } from "@/lib/games-catalogue";
import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

// The per-game `app/protected/games/*/loading.tsx` files are route-level Suspense
// boundaries — they only render when Next NAVIGATES to those routes. Games opened
// from the lobby (`/?game=<slug>`) never navigate: they mount as a client overlay,
// so the only loading UI in play is next/dynamic's `loading` option below. It used
// to be a bare spinner, which is why every game showed the generic "LOADING GAME…"
// instead of its own art. This renders the same branded screen the routes use.
function GameLoading({ slug }: { slug: GameSlug }) {
  // `ready` stays false — the loader climbs to 85% and holds there until the
  // chunk resolves and this component unmounts (same as the route loading.tsx).
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId={slug} progress={progress} />;
}

const loaderFor = (slug: GameSlug) => {
  const Loader = () => <GameLoading slug={slug} />;
  Loader.displayName = `GameLoading(${slug})`;
  return Loader;
};

// Lazy-load each heavy game client component only when selected — keeps the
// lobby (`/`) bundle light (Three.js etc. stay out of the initial load).
const Dice3DGame = dynamic(
  () => import("@/components/games/dice-3d/dice-3d-game").then((m) => m.Dice3DGame),
  { ssr: false, loading: loaderFor("dice-3d") },
);
const SkyRiseGame = dynamic(
  () => import("@/components/games/skyrise/sky-rise-game").then((m) => m.SkyRiseGame),
  { ssr: false, loading: loaderFor("skyrise") },
);
const CoinflipGame = dynamic(
  () => import("@/components/games/coin-flip/coinflip-game").then((m) => m.CoinflipGame),
  { ssr: false, loading: loaderFor("coinflip") },
);
const HiLoGame = dynamic(
  () => import("@/components/games/hi-lo/hi-lo-game").then((m) => m.HiLoGame),
  { ssr: false, loading: loaderFor("hi-lo") },
);
const MinesGame = dynamic(() => import("@/components/games/mines/mines-game"), {
  ssr: false,
  loading: loaderFor("mines"),
});
const LimboGame = dynamic(
  () => import("@/components/games/limbo/limbo-game").then((m) => m.LimboGame),
  { ssr: false, loading: loaderFor("limbo") },
);
const DragonTowerGame = dynamic(
  () => import("@/components/games/dragon-tower/dragon-tower-game").then((m) => m.DragonTowerGame),
  { ssr: false, loading: loaderFor("dragon-tower") },
);
const AndarBaharGame = dynamic(
  () => import("@/components/games/andar-bahar/andar-bahar-game").then((m) => m.AndarBaharGame),
  { ssr: false, loading: loaderFor("andar-bahar") },
);
const PlinkoGame = dynamic(
  () => import("@/components/games/plinko/plinko-game").then((m) => m.PlinkoGame),
  { ssr: false, loading: loaderFor("plinko") },
);
const KenoGame = dynamic(
  () => import("@/components/games/keno/keno-game").then((m) => m.KenoGame),
  { ssr: false, loading: loaderFor("keno") },
);
const DragonTigerGame = dynamic(
  () => import("@/components/games/dragon-tiger/dragon-tiger-game").then((m) => m.DragonTigerGame),
  { ssr: false, loading: loaderFor("dragon-tiger") },
);
const TeenPattiGame = dynamic(
  () => import("@/components/games/teen-patti/teen-patti-game").then((m) => m.TeenPattiGame),
  { ssr: false, loading: loaderFor("teen-patti") },
);

function renderGame(slug: GameSlug, initialBalance: number, userName?: string, avatarUrl?: string) {
  switch (slug) {
    case "dice-3d":
      return <Dice3DGame initialBalance={initialBalance} />;
    case "skyrise":
      return <SkyRiseGame initialBalance={initialBalance} userName={userName} />;
    case "coinflip":
      return <CoinflipGame initialBalance={initialBalance} />;
    case "hi-lo":
      return <HiLoGame initialBalance={initialBalance} />;
    case "mines":
      return <MinesGame initialBalance={initialBalance} />;
    case "limbo":
      return <LimboGame initialBalance={initialBalance} />;
    case "dragon-tower":
      return <DragonTowerGame initialBalance={initialBalance} />;
    case "andar-bahar":
      return <AndarBaharGame initialBalance={initialBalance} />;
    case "plinko":
      return <PlinkoGame initialBalance={initialBalance} />;
    case "keno":
      return <KenoGame initialBalance={initialBalance} />;
    case "dragon-tiger":
      return <DragonTigerGame initialBalance={initialBalance} userName={userName} avatarUrl={avatarUrl} />;
    case "teen-patti":
      return <TeenPattiGame initialBalance={initialBalance} userName={userName} avatarUrl={avatarUrl} />;
    default:
      return null;
  }
}

export function GameView({
  slug,
  initialBalance,
  userName,
  avatarUrl,
}: {
  slug: GameSlug;
  initialBalance: number;
  userName?: string;
  avatarUrl?: string;
}) {
  // The game's own wrapper provides the back-to-lobby control (with a confirm
  // prompt); browser/Android back also closes the overlay via popstate.
  return (
    <div className="relative min-h-full">
      {renderGame(slug, initialBalance, userName, avatarUrl)}
      <span className="sr-only">{gameTitle(slug)}</span>
    </div>
  );
}
