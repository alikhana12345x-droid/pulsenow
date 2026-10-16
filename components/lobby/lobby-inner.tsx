"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFinanceDrawer } from "@/components/protected/finance-drawer-provider";
import { useAuthModal } from "@/components/auth/auth-modal-provider";
import { LobbyHeader } from "@/components/protected/lobby-header";
import { LobbyGrid } from "./lobby-grid";
import { GameView } from "./game-view";
import { GameExitProvider } from "./game-exit-context";
import { isGameSlug, type GameSlug, type RegistryGame } from "@/lib/games-catalogue";

type Promos = {
  banner: React.ComponentProps<typeof LobbyGrid>["banner"];
  toast: React.ComponentProps<typeof LobbyGrid>["toast"];
  modal: React.ComponentProps<typeof LobbyGrid>["modal"];
};

export function LobbyInner({
  isLoggedIn,
  email,
  initialGame,
  serverBalance,
  userName,
  avatarUrl,
  betCount,
  totalWagered,
  promos,
  games,
}: {
  isLoggedIn: boolean;
  email?: string;
  initialGame: GameSlug | null;
  serverBalance: number;
  userName?: string;
  avatarUrl?: string;
  betCount: number;
  totalWagered: number;
  promos: Promos;
  games: RegistryGame[];
}) {
  const { balance, refresh } = useFinanceDrawer();
  const { openAuth } = useAuthModal();

  // Only "live" games are openable. coming_soon / maintenance / hidden are blocked
  // here (and the server actions reject them too — this is just the UX layer).
  const liveSlugs = useMemo(
    () => new Set(games.filter((g) => g.status === "live").map((g) => g.slug)),
    [games],
  );
  const canPlay = useCallback((slug: GameSlug | null): slug is GameSlug => !!slug && liveSlugs.has(slug), [liveSlugs]);

  // Active game is client state (instant, no route navigation); the URL is kept
  // in sync via the History API so links/refresh/back still work.
  const [activeGame, setActiveGame] = useState<GameSlug | null>(
    isLoggedIn && canPlay(initialGame) ? initialGame : null,
  );

  // Sync the active game with what the server resolved from the URL:
  //  • logged-out + ?game=<live> → prompt login (with a return path) and clean the URL
  //  • logged-in → open whatever the URL asked for, if it's a live game
  useEffect(() => {
    if (!isLoggedIn) {
      if (canPlay(initialGame)) {
        openAuth("login", { next: `/?game=${initialGame}` });
        window.history.replaceState(window.history.state, "", "/");
      }
      return;
    }
    setActiveGame(canPlay(initialGame) ? initialGame : null);
  }, [isLoggedIn, initialGame, openAuth, canPlay]);

  const openGame = useCallback(
    (slug: GameSlug) => {
      // Never open a non-live game, even from a stale link or the header menu.
      if (!liveSlugs.has(slug)) return;
      if (!isLoggedIn) {
        openAuth("login", { next: `/?game=${slug}` });
        return;
      }
      // Enter fullscreen HERE — this runs synchronously inside the card's click
      // handler, which is the only place a user gesture exists. The game wrappers
      // used to do it themselves, but a mounted component has no gesture: one
      // called requestFullscreen() on mount (always silently rejected) and the
      // other latched onto the first pointerdown ANYWHERE in the game, so tapping
      // a bet button would yank the player into fullscreen mid-round.
      // Deep links (/?game=… typed or opened after login) have no gesture and stay
      // windowed; the wrapper's "Better in Fullscreen" prompt covers that case.
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => { });
      }
      setActiveGame(slug);
      window.history.pushState(window.history.state, "", `/?game=${slug}`);
      refresh();
    },
    [isLoggedIn, openAuth, refresh, liveSlugs],
  );

  const closeGame = useCallback(() => {
    // Fullscreen belongs to the game, not the lobby — drop it on the way out.
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { });
    setActiveGame(null);
    // Replace (not push) so the in-app back button doesn't leave a dangling
    // "/?game=…" entry that browser-back would reopen.
    window.history.replaceState(window.history.state, "", "/");
    refresh();
  }, [refresh]);

  // Sync with browser back/forward.
  useEffect(() => {
    if (!isLoggedIn) return;
    const onPop = () => {
      const g = new URLSearchParams(window.location.search).get("game");
      setActiveGame(isGameSlug(g) && liveSlugs.has(g) ? g : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isLoggedIn, liveSlugs]);

  const liveBalance = balance ?? serverBalance;

  return (
    <>
      <div className="flex relative min-h-full flex-col bg-bp-bg font-bp-ui pb-20">
        <LobbyHeader
          email={email}
          isLoggedIn={isLoggedIn}
          games={games}
          onSelectGame={openGame}
          onHome={closeGame}
        />
        <LobbyGrid
          games={games}
          betCount={betCount}
          totalWagered={totalWagered}
          banner={promos.banner}
          toast={promos.toast}
          modal={promos.modal}
          onSelectGame={openGame}
        />
      </div>

      {activeGame && isLoggedIn && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-bp-bg">
          {/* Full viewport — each game owns its desktop/mobile responsive
              layout, so it must NOT be capped at the lobby's 600px column. */}
          {/* closeGame() unmounts this overlay synchronously — the game wrappers'
              "Return to Lobby" uses it instead of navigating to `/`. */}
          <GameExitProvider onExit={closeGame}>
            <GameView
              slug={activeGame}
              initialBalance={liveBalance}
              userName={userName}
              avatarUrl={avatarUrl}
            />
          </GameExitProvider>
        </div>
      )}
    </>
  );
}
