// Shared game catalogue for the public lobby + single-page game switching.
// `id` keys the card art (see components/protected/game-card-art.tsx); `slug`
// is the canonical key for the `?game=` URL param, the /protected/games/<slug>
// deep-link stubs, and the game-view lazy-import map.

export type GameSlug = "dice-3d" | "skyrise" | "coinflip" | "hi-lo" | "mines" | "limbo" | "dragon-tower" | "andar-bahar" | "plinko" | "keno" | "dragon-tiger" | "teen-patti";

export interface LobbyGame {
  id: string;
  slug: GameSlug;
  title: string;
  subtitle: string;
  emoji: string;
  gradient: string;
  glow?: string;
  badge?: string;
  payout?: string;
  featured?: boolean;
}

export interface ComingSoonGame {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  gradient: string;
}

export const LIVE_GAMES: LobbyGame[] = [
  {
    id: "dice-3d",
    slug: "dice-3d",
    title: "Dice 3D",
    subtitle: "Predict high or low — 3D rendered",
    badge: "LIVE",
    payout: "Up to 9900×",
    emoji: "🎯",
    gradient: "from-purple-600 via-violet-700 to-indigo-900",
    glow: "rgba(139,92,246,0.35)",
    featured: false,
  },
  {
    id: "skyrise",
    slug: "skyrise",
    title: "Aviator",
    subtitle: "Cash out before it crashes",
    badge: "LIVE",
    payout: "Up to 9900×",
    emoji: "✈️",
    gradient: "from-[#1e0a3c] via-[#0e0c1f] to-[#080613]",
    glow: "rgba(92,18,178,0.35)",
    featured: true,
  },
  {
    id: "coinflip",
    slug: "coinflip",
    title: "Coin Flip",
    subtitle: "Heads or tails",
    badge: "LIVE",
    payout: "1.96×",
    emoji: "🪙",
    gradient: "from-amber-500 via-orange-600 to-amber-900",
    glow: "rgba(245,158,11,0.3)",
    featured: false,
  },
  {
    id: "limbo",
    slug: "limbo",
    title: "Limbo",
    subtitle: "Set a target multiplier and let it fly",
    badge: "NEW",
    payout: "Up to 1000×",
    emoji: "📈",
    gradient: "from-[#241703] via-[#100d1a] to-[#070510]",
    glow: "rgba(242,154,11,0.32)",
    featured: false,
  },
  {
    id: "cards",
    slug: "hi-lo",
    title: "Hi-Lo",
    subtitle: "Higher or lower — read the deck",
    emoji: "🃏",
    gradient: "from-emerald-600 via-teal-700 to-emerald-950",
  },
  {
    id: "mines",
    slug: "mines",
    title: "Mines",
    subtitle: "Avoid the mines and cash out before it explodes",
    emoji: "💣",
    gradient: "from-rose-600 via-pink-700 to-rose-950",
  },
  {
    id: "dragon-tower",
    slug: "dragon-tower",
    title: "Dragon Tower",
    subtitle: "Climb the tower, dodge the dragons",
    badge: "NEW",
    payout: "Up to 2000×",
    emoji: "🐉",
    gradient: "from-[#2a0f10] via-[#150818] to-[#0c0511]",
    glow: "rgba(249,115,22,0.32)",
  },
  {
    id: "andar-bahar",
    slug: "andar-bahar",
    title: "Andar Bahar",
    subtitle: "Pick a side — inside or outside",
    badge: "NEW",
    payout: "1.96×",
    emoji: "🎴",
    gradient: "from-emerald-600 via-green-700 to-teal-950",
    glow: "rgba(16,185,129,0.32)",
  },
  {
    id: "plinko",
    slug: "plinko",
    title: "Plinko",
    subtitle: "Drop the ball, ride the multiplier",
    badge: "NEW",
    payout: "Up to 1000×",
    emoji: "🎳",
    gradient: "from-violet-600 via-purple-700 to-violet-950",
    glow: "rgba(139,92,246,0.35)",
  },
  {
    id: "keno",
    slug: "keno",
    title: "Keno",
    subtitle: "Pick your numbers, watch them drop",
    badge: "NEW",
    payout: "Up to 1000×",
    emoji: "🔢",
    gradient: "from-indigo-600 via-blue-700 to-indigo-950",
    glow: "rgba(99,102,241,0.35)",
  },
  {
    id: "dragon-tiger",
    slug: "dragon-tiger",
    title: "Dragon vs Tiger",
    subtitle: "Pick a side — one card decides",
    badge: "NEW",
    payout: "Up to 9×",
    emoji: "🐯",
    gradient: "from-[#0d1b4b] via-[#160a2e] to-[#5b2a06]",
    glow: "rgba(245,182,10,0.32)",
  },
  {
    id: "teen-patti",
    slug: "teen-patti",
    title: "Teen Patti",
    subtitle: "Two hands, one winner — back a side",
    badge: "NEW",
    payout: "Up to 3.70×",
    emoji: "🂡",
    gradient: "from-[#0d3b2e] via-[#123a2c] to-[#07241c]",
    glow: "rgba(212,160,44,0.32)",
  },
];

// All roadmap games are now live — see lib/docs/new-games/games-roadmap.md.
export const SOON_GAMES: ComingSoonGame[] = [];

export const GAME_SLUGS = LIVE_GAMES.map((g) => g.slug);

export function isGameSlug(value: string | null | undefined): value is GameSlug {
  return !!value && (GAME_SLUGS as string[]).includes(value);
}

export function gameTitle(slug: GameSlug): string {
  return LIVE_GAMES.find((g) => g.slug === slug)?.title ?? "Game";
}

// ─── DB-backed registry (admin-controlled presentation + availability) ──────────
// The lobby now reads games from the `games` table via lib/games-registry.ts.
// These shared, client-safe types + the static fallback below let the lobby keep
// working before the table is seeded.

export type GameStatus = "live" | "coming_soon" | "maintenance" | "hidden";

export interface RegistryGame {
  slug: GameSlug;
  gameType: string;       // = game_rounds.game_type (differs from slug only for dice)
  title: string;
  subtitle: string;
  emoji: string;
  gradient: string;
  glow: string | null;
  payoutLabel: string | null;
  badge: string | null;
  featured: boolean;
  sortOrder: number;
  status: GameStatus;
  cardImageUrl: string | null;     // optional override of the coded SVG card art
  loadingImageUrl: string | null;
  bannerImageUrl: string | null;
}

// slug → the gameType string used in game_rounds / the server actions.
export const SLUG_TO_GAME_TYPE: Record<GameSlug, string> = {
  "dice-3d": "dice",
  skyrise: "skyrise",
  coinflip: "coinflip",
  "hi-lo": "hi-lo",
  mines: "mines",
  limbo: "limbo",
  "dragon-tower": "dragon-tower",
  "andar-bahar": "andar-bahar",
  plinko: "plinko",
  keno: "keno",
  "dragon-tiger": "dragon-tiger",
  "teen-patti": "teen-patti",
};

export function coerceGameStatus(s: string): GameStatus {
  return s === "live" || s === "coming_soon" || s === "maintenance" || s === "hidden"
    ? s
    : "hidden";
}

// Lobby fallback derived from the static arrays — used when the `games` table is
// empty or unreachable, so the lobby (and seeding) always has a known-good baseline.
export function catalogueFallbackGames(): RegistryGame[] {
  const live: RegistryGame[] = LIVE_GAMES.map((g, i) => ({
    slug: g.slug,
    gameType: SLUG_TO_GAME_TYPE[g.slug],
    title: g.title,
    subtitle: g.subtitle,
    emoji: g.emoji,
    gradient: g.gradient,
    glow: g.glow ?? null,
    payoutLabel: g.payout ?? null,
    badge: g.badge ?? null,
    featured: g.featured ?? false,
    sortOrder: i,
    status: "live",
    cardImageUrl: null,
    loadingImageUrl: null,
    bannerImageUrl: null,
  }));
  return live;
}
