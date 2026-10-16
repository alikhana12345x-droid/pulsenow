"use client";

import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

export default function AndarBaharLoading() {
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId="andar-bahar" progress={progress} />;
}
