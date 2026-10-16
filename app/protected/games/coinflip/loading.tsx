"use client";

import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

export default function CoinflipLoading() {
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId="coinflip" progress={progress} />;
}
