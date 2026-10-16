"use client";

import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

export default function PlinkoLoading() {
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId="plinko" progress={progress} />;
}
