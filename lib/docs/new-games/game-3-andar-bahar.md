# Game 3 — Andar Bahar

> **Build order:** 3 of 5 · **Effort:** 🟡 Medium · **Status:** Not built
> **Reuses:** Hi-Lo's programmatic card rendering (`PlayingCard`, `SUITS`, `RANK_LABEL`) — **no card image assets needed**.
> **Slug:** `andar-bahar` · **House edge:** ~2% (configurable)

Andar Bahar is the classic South-Asian card game and the single most culturally relevant addition for the PKR market. It's already implied in the lobby — the **Cards** tile subtitle reads *"Andar Bahar & Hi-Lo"* — but only Hi-Lo is built. This closes that promise.

A single **joker** card is revealed, then cards are dealt alternately to two piles, **Andar** (inside) and **Bahar** (outside), until a card matching the joker's **rank** appears. The player bets on which side the match lands.

---

## How a player plays

1. Set bet amount (PKR 10 – 20,000).
2. Choose a side: **Andar** or **Bahar**.
3. Press **Deal**. The joker is revealed; cards flip alternately onto each pile.
4. Win if the first rank-match lands on the side you picked. Payout `≈ 1.96×` (tunable per side).

## Win condition

```
matchSide === pickedSide
```

The dealt sequence and its length are **cosmetic** — they drive the flip animation. The win/loss decision is made first (below), then the deck is arranged so the match lands on the correct side.

## Payout / fair odds

Andar Bahar is near-50/50 (Andar has a tiny edge because it's often dealt first). Simplest correct model: a fixed multiplier with a built-in house edge, identical in spirit to Coin Flip's `1.96×`.

```
multiplier ≈ 1.96×        // 2% edge on an even-money bet
```

Win-probability integration mirrors **Coin Flip**:

```
effectiveWinPct = isPromo
  ? winProbability
  : capWinProbabilityForHouseEdge(winProbability, multiplier, 0.02)
```

> Optional realism: pay Andar `1.90×` and Bahar `2.00×` to reflect the real asymmetry. If you do, cap each side against its own multiplier.

## Engine function (new, in `lib/game-engine.ts`)

```ts
// Decide win/loss first, then arrange the deal so the match lands on the right side.
export function dealAndarBahar(serverSeed, effectiveWinPct, pickedSide) {
  const win = generateFloat(serverSeed, "ab", 0) < effectiveWinPct / 100;
  const matchSide = win ? pickedSide : (pickedSide === "andar" ? "bahar" : "andar");
  // joker = seeded random card; then deal alternating non-matching cards, placing the
  // first matching-rank card on `matchSide`'s turn. Returns the full sequence for the UI.
  return { joker, andar: [...], bahar: [...], matchSide, win };
}
```

Cards are `{ rank, suit }` — the exact shape Hi-Lo already uses, so the UI renders them with the existing `PlayingCard` component.

## Server flow

Single transaction — extend `placeBet()` (or a small dedicated action) returning the full deal for animation.

```
Client                          Server
  │                                │
  │── POST /api/games/             │  1. Auth + wallet lock
  │      andar-bahar ──────────────▶│  2. getPlayerWinProbability()
  │   { amount,                     │  3. capWinProbabilityForHouseEdge(winPct, 1.96, 0.02)
  │     choice: { side } }          │  4. dealAndarBahar() → joker + sequences + matchSide
  │                                 │  5. won = matchSide === side
  │                                 │  6. payout, persist round + bet + transaction
  │◀─ { won, joker, andar, bahar, ─│
  │    matchSide, multiplier,       │
  │    payout, newBalance }         │
  │                                 │
  │  [Client animates the deal      │
  │   to the server's sequence]     │
```

## Files to create / touch

- `lib/game-engine.ts` — `dealAndarBahar()`
- `lib/actions/games.ts` — `"andar-bahar"` branch / action (`choice = { side }`, `houseEdge = "0.0200"`)
- `app/api/games/andar-bahar/route.ts`
- `components/games/andar-bahar/andar-bahar-game.tsx` — table, two piles, deal animation
- **Extract** Hi-Lo's `PlayingCard` + `SUITS` + `RANK_LABEL` into a shared `components/games/_shared/playing-card.tsx` so both games import it (refactor, not a rewrite)
- `components/games/games-wrapper.tsx` — `GAME_RULES["andar-bahar"]`
- `lib/games-catalogue.ts` — add slug; promote from `SOON_GAMES`
- `components/protected/game-card-art.tsx` — `AndarBaharArt` + register in `lobby-grid.tsx`

## Assets required

See the [asset tooling reference](./games-roadmap.md#asset-tooling-reference).

| Asset | Description | Recommendation |
|---|---|---|
| **52-card faces** | All ranks × suits | **Generate / reuse** — render programmatically with Hi-Lo's `PlayingCard` (rank + suit glyph). **Zero image assets.** This is the big cost-saver. |
| **Card back** | Flip-animation back face | **Generate** — single SVG with the brand `✦` motif (see `CardsArt` back card). |
| **Table layout** | Felt background with **Andar** / **Bahar** zones + joker slot | **Generate** — CSS gradient "felt" + labelled drop zones; no image. |
| **Lobby card art** | Two fanned piles around a centre joker | **Generate** — adapt the existing `CardsArt` SVG into `AndarBaharArt`. |
| **SFX** | `card deal` flick (per card), `win` chime, `lose` thud | **Generate/free** — card-flick from Pixabay/freesound; loop per dealt card. |
| **Win celebration** | Confetti + haptic | **Reuse** — `lib/confetti.ts`, `lib/haptics.ts`. |

**Purchase (optional):** if you want a more *premium* casino-table feel, a felt-texture + chip image pack from Envato/Kenney elevates it — but the programmatic path ships with no spend.

## Build checklist

- [x] Extracted shared `PlayingCard`/`CornerPip`/`SUITS`/`RANK_LABEL`/`Card` → `components/games/_shared/playing-card.tsx`; Hi-Lo refactored to import it (verbatim, tsc-verified — no behaviour change)
- [x] `dealAndarBahar` + `AB_MULTIPLIER`/`AB_HOUSE_EDGE` — `lib/game-engine.ts`
- [x] `placeBet` `"andar-bahar"` branch with Coin-Flip-style 0.02 cap — `lib/actions/games.ts` (uses `/api/games/bet`, no new route)
- [x] `andar-bahar-game.tsx` — joker + two lanes, server-driven alternating deal animation
- [x] `GAME_RULES["andar-bahar"]` + `GameType` — `games-wrapper.tsx`
- [x] `AndarBaharArt` + lobby registration; lazy-import route; deep-link stub + loading screen
- [x] `EXPECTED_HOLD["andar-bahar"] = 0.02` + admin promo CTA option
- [x] Promoted to `LIVE_GAMES`, removed from `SOON_GAMES`; **renamed the `Cards` tile → `Hi-Lo`** (its old "Andar Bahar & Hi-Lo" subtitle is now a standalone game)
- [x] Verified: tsc + eslint clean; sim (300k×4) → match always on picked side iff win, exactly one match card and it's last on the winning side, win-rate tracks effective %, house holds ≥2% at the 50% cap (never loses)
- [ ] (follow-up assets) `/brand/loading/andar-bahar.png`, promo banner `/brand/promotions/games/andar-bahar.png` + template, card-deal SFX

## Implementation notes (decisions made during build)

- **Single fixed 1.96× for both sides** (not the optional Andar/Bahar asymmetry) — mirrors Coin Flip, capped at a 2% edge. The asymmetry can be layered later by capping each side against its own multiplier.
- **`/api/games/bet`, not a dedicated route.** Andar Bahar is a single-transaction instant game, so it's a `placeBet` branch like dice/coinflip/limbo; the full deal (`joker`, `andar[]`, `bahar[]`, `matchSide`) rides back in `outcome` and the client animates it.
- **Win decided first, deck arranged to match.** `dealAndarBahar` picks win/loss from the (capped) win probability, then deals non-matching cards (rank forced ≠ joker) until the winning side's turn, where it places the sole matching card. The dealt length (0–9 pre-match cards) is pure animation flavour.
