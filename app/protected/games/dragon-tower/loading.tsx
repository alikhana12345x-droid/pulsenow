"use client";

import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

export default function DragonTowerLoading() {
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId="dragon-tower" progress={progress} />;
}
