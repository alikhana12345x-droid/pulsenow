"use client";

import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

export default function LimboLoading() {
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId="limbo" progress={progress} />;
}
