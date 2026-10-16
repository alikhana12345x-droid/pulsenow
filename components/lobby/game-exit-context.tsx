"use client";

import { createContext, useContext } from "react";

// When a game is opened from the lobby it renders as an overlay on top of the
// still-mounted lobby (see LobbyInner), so leaving is pure client state — no
// navigation needed. The game wrappers used to call router.push("/") instead,
// which re-rendered the fully dynamic `/` on the server (auth claims + wallet +
// profile + promos + lobby games) and, with no loading.tsx on `/`, left the game
// frozen on screen for the whole round-trip. That's the multi-second "Return to
// Lobby" delay, and it's worst on mobile.
//
// LobbyInner provides its closeGame() here; the wrappers prefer it and fall back
// to router.push("/") when a game is rendered as its own route (/protected/games/*).
const GameExitContext = createContext<(() => void) | null>(null);

export function GameExitProvider({
  onExit,
  children,
}: {
  onExit: () => void;
  children: React.ReactNode;
}) {
  return <GameExitContext.Provider value={onExit}>{children}</GameExitContext.Provider>;
}

/** Returns the lobby's instant-close callback, or null when not lobby-hosted. */
export function useGameExit() {
  return useContext(GameExitContext);
}
