"use client";

import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

export default function TeenPattiLoading() {
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId="teen-patti" progress={progress} />;
}
