"use client";

import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

export default function SkyRiseLoading() {
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId="skyrise" progress={progress} />;
}
