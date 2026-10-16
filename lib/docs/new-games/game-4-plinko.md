# Game 4 — Plinko

> **Build order:** 4 of 5 · **Effort:** 🟠 Medium-High (front-end physics) · **Status:** Coming soon (already on the lobby shelf)
> **Reuses:** the win-probability engine; new front-end ball animation.
> **Slug:** `plinko` · **House edge:** ~1% (baked into the multiplier table)

Plinko drops a ball through a triangular peg field; it bounces left/right at each row and lands in one of the bottom **multiplier buckets**. Risk level and row count reshape the payout curve — low risk = flat (frequent ~1×), high risk = spiky (rare big multipliers at the edges). One of the highest-converting "originals."

---

## How a player plays

1. Set bet amount (PKR 10 – 20,000).
2. Choose **rows** (8 / 12 / 16) and **risk** (Low / Medium / High).
3. Press **Drop**. A ball falls through the pegs and lands in a bucket.
4. Payout = `bet × bucketMultiplier`. (Auto-drop / multi-ball is a fast-follow.)

## Outcome model (provably fair)

For `N` rows, the ball makes `N` left/right decisions. The bucket index = number of "rights" (0…N). A pure-random walk gives a **binomial** distribution — centre buckets common, edges rare. Multipliers per bucket come from a **paytable** indexed by `(risk, rows)`; the edge is baked in so `Σ P(bucket) × mult(bucket) = 1 − houseEdge`.

```
bucketIndex = count of "right" bounces over N rows
multiplier  = PAYTABLE[risk][rows][bucketIndex]
payout      = bet × multiplier
```

## Win-probability integration

The player **chooses risk/rows, not the multiplier directly**, so the cap applies against the table's **maximum** bucket:

```
maxMult = max(PAYTABLE[risk][rows])
effectiveWinPct (for the "lands in a profitable bucket" decision)
  = isPromo ? winProbability
            : capWinProbabilityForHouseEdge(winProbability, maxMult, 0.01)
```

Implementation: decide a target **outcome band** (loss bucket vs profit bucket) from the effective win %, then bias each bounce so the ball lands in a bucket consistent with that band. The per-bounce L/R sequence is generated from the server seed and **returned to the client** so the animation is deterministic and verifiable.

> Keep the displayed bounce path consistent with the final bucket — animate to the server's path, never run independent client physics that could disagree with the settled bucket.

## Server flow

Single transaction — `placeBet`-style action returning the path + bucket.

```
Client                          Server
  │                                │
  │── POST /api/games/plinko ──────▶│  1. Auth + wallet lock
  │   { amount, rows, risk }        │  2. getPlayerWinProbability()
  │                                 │  3. cap vs max(PAYTABLE[risk][rows])
  │                                 │  4. generate path[] (N × L/R) → bucketIndex
  │                                 │  5. multiplier = PAYTABLE[risk][rows][bucketIndex]
  │                                 │  6. payout, persist round + bet + transaction
  │◀─ { path, bucketIndex, ────────│
  │    multiplier, payout,          │
  │    newBalance }                 │
  │                                 │
  │  [Animate ball along path[]     │
  │   to bucketIndex]               │
```

## Files to create / touch

- `lib/game-engine.ts` — `dropPlinkoWithProbability()` (path + bucket), `PLINKO_PAYTABLE`
- `lib/actions/games.ts` — `"plinko"` action (`choice = { rows, risk }`, `houseEdge = "0.0100"`)
- `app/api/games/plinko/route.ts`
- `components/games/plinko/plinko-game.tsx` — board + drop controls
- `components/games/plinko/plinko-board.tsx` — peg field + ball animation
- `components/games/games-wrapper.tsx` — `GAME_RULES.plinko`
- `lib/games-catalogue.ts` — already in `SOON_GAMES`; promote to `LIVE_GAMES` on launch
- `components/protected/game-card-art.tsx` — `PlinkoArt` + register in `lobby-grid.tsx`

## Assets required

See the [asset tooling reference](./games-roadmap.md#asset-tooling-reference).

| Asset | Description | Recommendation |
|---|---|---|
| **Peg board** | Triangular grid of pegs (8/12/16 rows) | **Generate** — render pegs as positioned SVG `<circle>`s from the row count; no image. |
| **Ball** | Falling token with motion blur / trail | **Generate** — SVG/CSS circle with a glow trail; or a tiny Lottie. |
| **Multiplier buckets** | Coloured slots labelled with each multiplier (green→red by risk) | **Generate** — CSS pill row; colour-map by multiplier value. |
| **Drop animation** | Ball bouncing peg-to-peg along `path[]` | **Generate** — CSS keyframes / `requestAnimationFrame` snapping to the server path. Optional: `matter.js` for visual bounce **but always settle on the server bucket**. |
| **Lobby card art** | Peg triangle + ball + a few coloured buckets | **Generate** — hand-code `PlinkoArt` SVG. |
| **SFX** | `peg tick` (per bounce), `bucket land`, win/lose | **Generate/free** — short ticks via jsfxr looped per bounce; land chime from Pixabay. |
| **Win celebration** | Confetti on high-multiplier buckets | **Reuse** — `lib/confetti.ts`. |

**Purchase (optional):** a polished **Lottie ball-drop / coin-burst** from LottieFiles (some premium) can make the drop feel premium with little code — nice-to-have, not required.

## Build checklist

- [x] `PLINKO_PAYTABLE` {8,12,16} × {low,med,high} with verified fair `Σ p·mult ≈ 0.99` — `lib/games/plinko.ts` (shared, pure)
- [x] `dropPlinkoWithProbability` (gated bucket sample + deterministic path) — `lib/game-engine.ts`
- [x] `placePlinkoBet` **dedicated action** + `/api/games/plinko` route (NOT a placeBet branch — Plinko always pays the bucket mult)
- [x] `plinko-board.tsx` deterministic ball animation snapping to the server path
- [x] `plinko-game.tsx` (rows/risk/bet controls, drop, settle-on-land)
- [x] `GAME_RULES.plinko` + `GameType`; `PlinkoArt` + lobby registration; lazy-import route; deep-link stub + loading
- [x] `EXPECTED_HOLD.plinko` + admin promo CTA option
- [x] Promote to `LIVE_GAMES`, remove from `SOON_GAMES`
- [x] Verified: tsc + eslint clean; 2 simulations (paytable EV + end-to-end engine) → fair EV ≈ 0.99, house safe across all 9 configs, path→bucket consistent; 4-agent adversarial review (server/client/house-safety/integration) — 3 real fixes applied
- [ ] (follow-up assets) `/brand/loading/plinko.png`, promo banner + template, peg-tick/land SFX, optional Lottie ball-drop

## Implementation notes (decisions made during build)

- **Cap derivation corrected.** The spec said cap normal players via `capWinProbabilityForHouseEdge(winPct, maxBucket, 0.01)`. That's **unsafe** once sub-1× loss buckets are factored in: with win rounds landing in profit buckets W and loss rounds in loss buckets L, `EV = q·A + (1−q)·B` where `A=E[mult|W]`, `B=E[mult|L]`. The correct cap is `qMax = (1−edge−B)/(A−B)` — implemented as `plinkoMaxWinPct(rows,risk)`. Verified by simulation: hold is positive for every config at the 20% default and exactly ~1% at the cap.
- **Hold model = the platform's winPct-gated one** (like Mines/Dragon Tower): risk/rows change variance and max payout; `winPct` drives the hold (6–25% for normal players at the default). Promo players bypass the cap (house may lose, by design). Max single-payout exposure = 1000× × 20k = 20M (high-16), in line with Mines/Tower.
- **Dedicated action, not `placeBet`.** Plinko *always* returns the bucket multiplier (even 0.2× returns part of the stake), which `placeBet`'s win-gated `payout = won ? amount×mult : 0` can't express. `placePlinkoBet` settles with `payout = amount × mult` directly. `total_won` only counts net wins (profit>0), matching `placeBet`.
- **Deterministic animation.** The server returns the full `path` (L/R per row) with exactly `bucket` rights; the board animates to it and never runs independent physics, so the displayed landing always equals the settled bucket. Ball x at the final row = `(bucket+0.5)/(rows+1)` = the bucket's centre.
