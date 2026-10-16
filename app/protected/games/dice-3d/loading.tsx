"use client";

import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

export default function Dice3DLoading() {
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId="dice-3d" progress={progress} />;
}
