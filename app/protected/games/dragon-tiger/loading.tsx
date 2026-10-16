"use client";

import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

export default function DragonTigerLoading() {
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId="dragon-tiger" progress={progress} />;
}
