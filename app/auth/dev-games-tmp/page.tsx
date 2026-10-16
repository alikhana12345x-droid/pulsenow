"use client";

// TEMPORARY harness for checking game control panels at small widths.
// Delete after use. Visit /auth/dev-games-tmp?g=limbo
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const LimboGame = dynamic(() => import("@/components/games/limbo/limbo-game").then((m) => m.LimboGame), { ssr: false });
const Dice3DGame = dynamic(() => import("@/components/games/dice-3d/dice-3d-game").then((m) => m.Dice3DGame), { ssr: false });
const DragonTowerGame = dynamic(() => import("@/components/games/dragon-tower/dragon-tower-game").then((m) => m.DragonTowerGame), { ssr: false });
const PlinkoGame = dynamic(() => import("@/components/games/plinko/plinko-game").then((m) => m.PlinkoGame), { ssr: false });
const CoinflipGame = dynamic(() => import("@/components/games/coin-flip/coinflip-game").then((m) => m.CoinflipGame), { ssr: false });

function Inner() {
  const g = useSearchParams().get("g") ?? "limbo";
  if (g === "dice-3d") return <Dice3DGame initialBalance={5000} />;
  if (g === "dragon-tower") return <DragonTowerGame initialBalance={5000} />;
  if (g === "plinko") return <PlinkoGame initialBalance={5000} />;
  if (g === "coinflip") return <CoinflipGame initialBalance={5000} />;
  return <LimboGame initialBalance={5000} />;
}

export default function DevGamesPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
