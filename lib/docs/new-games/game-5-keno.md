# Game 5 — Keno

> **Build order:** 5 of 5 · **Effort:** 🟡 Medium · **Status:** Coming soon (already on the lobby shelf)
> **Reuses:** the win-probability engine; mostly a paytable + grid UI.
> **Slug:** `keno` · **House edge:** ~1–4% (baked into the paytable)

Keno is a lottery-style number game. The player picks numbers on a grid; the house draws a fixed set; payout scales with how many picks **hit**. Light on art, heavy on a well-tuned paytable.

---

## How a player plays

1. Set bet amount (PKR 10 – 20,000).
2. Pick **1–10** numbers from a **40-number grid** (1–40). (Quick-pick / clear buttons help.)
3. Press **Play**. The server draws **10** numbers.
4. Payout = `bet × PAYTABLE[picksCount][hits]`, where `hits` = how many drawn numbers were among the player's picks.

## Outcome model

```
draw    = 10 distinct numbers from 1..40
hits    = |picks ∩ draw|
multiplier = PAYTABLE[picksCount][hits]      // 0 for low hit counts
payout  = bet × multiplier
```

The paytable is the house edge: for each `picksCount`, `Σ_h P(hits = h) × PAYTABLE[picksCount][h] = 1 − houseEdge`, where `P(hits = h)` is hypergeometric (40 numbers, 10 drawn, `picksCount` chosen).

## Win-probability integration

The player can realise a large multiplier (e.g. 10/10), so cap against the **maximum** payout for the chosen pick count:

```
maxMult = max(PAYTABLE[picksCount])
effectiveWinPct = isPromo
  ? winProbability
  : capWinProbabilityForHouseEdge(winProbability, maxMult, edge)
```

Implementation: from the effective win %, decide a target **hit band** (lose / small / big), then choose which of the player's picks the draw will include to hit that band, filling the rest of the draw with non-picked numbers. The full `draw[]` is generated from the server seed and returned for the reveal animation.

## Server flow

Single transaction — `placeBet`-style action returning the draw + hits.

```
Client                          Server
  │                                │
  │── POST /api/games/keno ────────▶│  1. Auth + wallet lock
  │   { amount, picks: number[] }   │  2. getPlayerWinProbability()
  │                                 │  3. cap vs max(PAYTABLE[picks.length])
  │                                 │  4. generate draw[] consistent with target hit band
  │                                 │  5. hits, multiplier = PAYTABLE[picks.length][hits]
  │                                 │  6. payout, persist round + bet + transaction
  │◀─ { draw, hits, multiplier, ───│
  │    payout, newBalance }         │
  │                                 │
  │  [Reveal draw[] one ball at a   │
  │   time, highlight hits]         │
```

## Files to create / touch

- `lib/game-engine.ts` — `drawKenoWithProbability()`, `KENO_PAYTABLE`
- `lib/actions/games.ts` — `"keno"` action (`choice = { picks }`)
- `app/api/games/keno/route.ts`
- `components/games/keno/keno-game.tsx` — 40-cell grid, pick/quick-pick, draw reveal
- `components/games/games-wrapper.tsx` — `GAME_RULES.keno`
- `lib/games-catalogue.ts` — already in `SOON_GAMES`; promote to `LIVE_GAMES` on launch
- `components/protected/game-card-art.tsx` — `KenoArt` + register in `lobby-grid.tsx`

## Assets required

See the [asset tooling reference](./games-roadmap.md#asset-tooling-reference).

| Asset | Description | Recommendation |
|---|---|---|
| **Number grid** | 40 selectable number tiles (states: idle / picked / hit / miss) | **Generate** — CSS grid of buttons; pure markup, no image. |
| **Drawn balls** | Lottery-ball reveal, one at a time | **Generate** — SVG circle with number; stagger reveal with CSS. Optional Lottie for a "ball drop". |
| **Paytable panel** | Live "hits → multiplier" table for the current pick count | **Generate** — render from `KENO_PAYTABLE`; no asset. |
| **Lobby card art** | A number grid with a few highlighted balls | **Generate** — hand-code `KenoArt` SVG. |
| **SFX** | `pick` tick, `ball draw` pop, `match` ping, win/lose | **Generate/free** — jsfxr ticks; ball pop from Pixabay. |
| **Win celebration** | Confetti when hits clear a payout threshold | **Reuse** — `lib/confetti.ts`. |

**Purchase:** none needed — Keno is grid + numbers + a paytable, all in-house.

## Build checklist

- [x] `KENO_PAYTABLE` picks 1–10 with verified hypergeometric fair `Σ p·mult ≈ 0.95–0.98`, jackpots capped at 1000× — `lib/games/keno.ts` (shared, pure)
- [x] `drawKenoWithProbability` (gated hit sample + draw built to contain exactly `hits` picks) — `lib/game-engine.ts`
- [x] `placeBet` `"keno"` branch with the per-pick `kenoMaxWinPct` cap (uses `/api/games/bet`, no dedicated route — Keno is win-or-nothing so it fits the win-gated payout)
- [x] `keno-game.tsx` — 40-cell grid, Quick Pick / Clear, staggered draw reveal, live paytable panel
- [x] `GAME_RULES.keno` + `GameType`; `KenoArt` + lobby registration; lazy-import route; deep-link stub + loading
- [x] `EXPECTED_HOLD.keno` + admin promo CTA option
- [x] Promote to `LIVE_GAMES`; **`SOON_GAMES` now empty** → the lobby's "Coming Soon" section is hidden when empty
- [x] Verified: tsc + eslint clean; 2 sims (paytable design + end-to-end engine) → fair EV ≈ 0.95–0.98, house holds ≥1% on every pick count (analytic), and `|draw∩picks| = hits` with 10 distinct valid numbers across 2M samples

## Implementation notes (decisions made during build)

- **Cap derivation = the Plinko one**, not the spec's "cap vs max payout" (unsafe with sub-1× contributions): `qMax = (1−edge−B)/(A−B)` per pick count via `kenoMaxWinPct(k)`. Verified house-safe for k=1..10.
- **`placeBet` branch, not a dedicated action.** Keno is win-or-nothing (losing hit counts pay 0×, no consolation tiers), so `placeBet`'s `payout = won ? amount×mult : 0` fits exactly — unlike Plinko, which needed its own always-pay action.
- **Win decided first, draw built to match.** `drawKenoWithProbability` picks the hit count from the winning/losing set (by hypergeometric weight), then assembles the draw from exactly `hits` of the player's picks + non-picks, so the revealed numbers always agree with the settled multiplier.
- **Proactive guards** from the Plinko review applied up front: a synchronous `playingRef` blocks double-POSTs, and the reveal interval is cleared on unmount.
