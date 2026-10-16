"use client";

import { GameLoadingScreen, useGameLoader } from "@/components/games/game-loading-screen";

export default function HiLoLoading() {
  const progress = useGameLoader(false);
  return <GameLoadingScreen gameId="hi-lo" progress={progress} />;
}
