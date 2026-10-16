# Game 2 — Dragon Tower

> **Build order:** 2 of 5 · **Effort:** 🟢 Low · **Status:** Not built
> **Reuses:** the Mines server flow almost verbatim (`startMinesRound → revealMineTile → settleMinesRound`, plus the `isWinRound` gating mechanic).
> **Slug:** `dragon-tower` · **House edge:** ~1%

Dragon Tower is Mines turned vertical. Instead of a 5×5 grid, the player climbs a **tower of rows**, picking one tile per row. Safe tiles (eggs) let them climb higher and compound the multiplier; a dragon ends the run. Cash out any time. The geometry differs from Mines; the server logic is nearly identical.

---

## How a player plays

1. Set bet amount (PKR 10 – 20,000) and **difficulty** (sets tiles-per-row and how many are safe).
2. Press **Bet** — server deals the tower.
3. Climb from the bottom row upward, picking **one tile per row**. An egg = safe (climb on); a dragon ends the run.
4. Each row cleared raises the multiplier. Press **Cash Out** any time to lock in winnings.
5. Clearing the top row auto-collects the max multiplier.

## Difficulty table

| Difficulty | Tiles / row | Safe / row | Per-row probability `p` | Per-row multiplier `(1−edge)/p` |
|---|---|---|---|---|
| Easy | 4 | 3 | 3/4 = 0.75 | ≈ 1.32× |
| Medium | 3 | 2 | 2/3 = 0.667 | ≈ 1.485× |
| Hard | 2 | 1 | 1/2 = 0.50 | ≈ 1.98× |
| Expert | 3 | 1 | 1/3 = 0.333 | ≈ 2.97× |
| Master | 4 | 1 | 1/4 = 0.25 | ≈ 3.96× |

## Win condition

Cash out before picking a dragon.

## Payout multiplier formula

```
multiplier(k) = ((1 − houseEdge) / p) ^ k        // k = rows cleared, p = safe/total per row
```

## Win-probability integration

Reuse the Mines model exactly — **no per-multiplier cap needed**. On a win round the player still faces the real per-row odds, so `EV = (1 − edge) × winPct ≤ (1 − edge)` at any win probability. Therefore use `winPct` directly for both normal and promo players (see the Mines comment in `lib/actions/games.ts`).

| Round type | Behaviour |
|---|---|
| **Win round** (`isWinRound = true`) | Real safe positions generated per row via seeded RNG; client can reveal normally. |
| **Loss round** (`isWinRound = false`) | Any tile the player picks is treated as a dragon — the server guarantees they can never cash out. Mirrors `revealMineTile`'s loss handling. |

## Server flow (mirrors Mines)

```
Client                          Server (lib/actions/games.ts)
  │                                │
  │── POST /api/games/             │  startDragonTowerRound:
  │      dragon-tower ─────────────▶│   1. Auth + wallet lock
  │   { amount, difficulty }        │   2. getPlayerWinProbability()
  │                                 │   3. isWinRound = rng() < winPct/100
  │                                 │   4. genTowerLayout(seed, difficulty) → safe[] per row
  │                                 │   5. Deduct bet, store pending round
  │◀─ { roundId, seedHash, ────────│
  │    newBalance, isWinRound }     │
  │                                 │
  │── POST .../dragon-tower/reveal ▶│  revealTowerTile (per row):
  │   { roundId, row, tileIndex }   │   safe → return multiplier(row+1)
  │                                 │   dragon (or loss round) → end, reveal layout
  │◀─ { result, row, multiplier } ──│
  │                                 │
  │── POST .../dragon-tower/settle ▶│  settleTowerRound:
  │   { roundId, outcome, picks }   │   validate picks all safe, pay out, mark completed
  │◀─ { newBalance, layout } ───────│
```

`outcome.layout` (safe positions per row) lives in the `game_rounds.outcome` JSONB, exactly like Mines stores `mineSet`.

> **Implemented differently from — and more securely than — Mines.** Mines sends the (encoded) layout to the client at round start and plays fully client-side, which a savvy player can read from the network to play win-rounds perfectly. Dragon Tower instead keeps the layout **server-side** and reveals one row at a time via `/reveal`; the client only learns the full layout when the round ends (dragon hit or top reached). The game's naturally sequential, slower pace makes the per-row round-trip a non-issue, and it closes the Mines cheat hole.

## Files to create / touch

- `lib/game-engine.ts` (or `actions/games.ts` helpers) — `genTowerLayout()`, `towerMultiplier()`
- `lib/actions/games.ts` — `startDragonTowerRound()`, `revealTowerTile()`, `settleTowerRound()`
- `app/api/games/dragon-tower/route.ts` + `/reveal` + `/settle`
- `components/games/dragon-tower/dragon-tower-game.tsx`
- `components/games/games-wrapper.tsx` — `GAME_RULES["dragon-tower"]`
- `lib/games-catalogue.ts` — add slug; promote from `SOON_GAMES`
- `components/protected/game-card-art.tsx` — `DragonTowerArt` + register in `lobby-grid.tsx`

## Assets required

See the [asset tooling reference](./games-roadmap.md#asset-tooling-reference).

| Asset | Description | Recommendation |
|---|---|---|
| **Lobby card art** | A stylised tower/ladder with a glowing egg and a flame at the top | **Generate** — hand-code `DragonTowerArt` SVG (stacked rounded tiles + egg + flame), same approach as `MinesArt`. |
| **Egg (safe) icon** | Dragon-egg tile face | **Generate** — SVG egg with gradient; or free CC0 icon from SVGRepo/Iconify. |
| **Dragon / flame (mine) icon** | Loss tile face | **Generate** — Iconify has dragon/flame glyphs (`mdi:fire`, `game-icons:dragon-head`); or hand-trace. |
| **Tile states** | hidden / revealed-safe / revealed-dragon / dimmed | **Generate** — CSS + the two icons above. |
| **SFX** | `reveal` pop, `climb` rising ping, `dragon roar` on loss, `cashout` chime | **Generate/free** — jsfxr for pops; a short roar from Pixabay/Mixkit. |
| **Win celebration** | Confetti + haptic on cash out | **Reuse** — `lib/confetti.ts`, `lib/haptics.ts`. |

**Purchase (optional):** a small premium **dragon-themed icon pack** (egg + dragon + flame in one consistent style) from Flaticon/Envato would sharpen the theme — but Iconify covers a free path.

## Build checklist

- [x] Shared config + payout math — `lib/games/dragon-tower.ts` (single source of truth for client + server)
- [x] `genTowerLayout` + `start / reveal / settle` server actions (server-authoritative reveal, loss-round guard, FOR UPDATE) — `lib/actions/games.ts`
- [x] API routes — `app/api/games/dragon-tower/{route,reveal/route,settle/route}.ts`
- [x] `dragon-tower-game.tsx` (vertical tower, difficulty selector, per-row reveal, cash-out)
- [x] `GAME_RULES["dragon-tower"]` + `GameType` — `games-wrapper.tsx`
- [x] `DragonTowerArt` + lobby registration — `game-card-art.tsx`, `lobby-grid.tsx`
- [x] Lazy-import route + deep-link stub + loading screen
- [x] `EXPECTED_HOLD["dragon-tower"]` + admin promo CTA option
- [x] Promote to `LIVE_GAMES`, remove from `SOON_GAMES`
- [x] Verified: tsc + eslint clean; sim → per-row mults match doc, house hold ~80% (winPct-gated, never loses), cap auto-cashes (Master→row6, Expert→row7), max exposure 40M ≈ Mines
- [ ] (follow-up assets) `/brand/loading/dragon-tower.png`, promo banner `/brand/promotions/games/dragon-tower.png` + template, dragon SFX/roar

## Implementation notes (decisions made during build)

- **Rows = 9, cap = 2000×.** The two single-safe-tile modes (Expert 2.97×/row, Master 3.96×/row) blow past any sane exposure over 9 rows, so payouts are capped at 2000× and **reaching the cap auto-cashes** the round (Master tops out at row 6, Expert at row 7). Easy/Medium/Hard climb the full 9 (max 12×/35×/468×). Max exposure on a 20k bet = PKR 40M, matching Mines.
- **Hold model = Mines'.** A `winPct`-gated `isWinRound` makes loss rounds (≈80% at the 20% default) un-winnable; win rounds pay fair odds with a 1% per-row edge. Effective hold is therefore ~80%, not 1% — `EXPECTED_HOLD` stores the nominal 1% formula edge (same convention as Mines' 5%).
- **No autoplay.** Dragon Tower is an inherently manual, multi-decision climb; an auto-rebet toggle (like Mines') was omitted as it wouldn't automate the picks.
