"use client";

import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

export default function KenoLoading() {
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId="keno" progress={progress} />;
}
