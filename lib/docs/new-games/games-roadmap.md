# BetPulse — Next Games Roadmap

> **Status: ✅ ALL 5 SHIPPED · 🐯 Game 6 spec'd.** Every game below is live in `LIVE_GAMES`; the
> "Coming Soon" shelf is now empty (and hidden in the lobby). Each plugs into the
> **existing** win-probability engine — see [README.md](./README.md#win-probability-system).
> Only follow-up work left is **art/SFX polish** — see **[game-assets.md](./game-assets.md)** —
> plus the next build: **Dragon vs Tiger** (below).

---

## Build order (all complete)

| # | Game | Archetype | Reuses | Effort | Status | Spec |
|---|------|-----------|--------|--------|--------|------|
| 1 | **Limbo** | Pure multiplier target | Dice engine (`rollDiceWithProbability`) | 🟢 Low | ✅ Live | [game-1-limbo.md](./game-1-limbo.md) |
| 2 | **Dragon Tower** | Row-by-row reveal, compounding | Mines flow (`start → reveal → settle`, `isWinRound`) | 🟢 Low | ✅ Live | [game-2-dragon-tower.md](./game-2-dragon-tower.md) |
| 3 | **Andar Bahar** | Card side-bet | Hi-Lo card rendering (programmatic) | 🟡 Medium | ✅ Live | [game-3-andar-bahar.md](./game-3-andar-bahar.md) |
| 4 | **Plinko** | Physics drop → bucket | New (front-end physics) | 🟠 Medium-High | ✅ Live | [game-4-plinko.md](./game-4-plinko.md) |
| 5 | **Keno** | Number matching | New (paytable) | 🟡 Medium | ✅ Live | [game-5-keno.md](./game-5-keno.md) |

### Next up

| # | Game | Archetype | Reuses | Effort | Status | Spec |
|---|------|-----------|--------|--------|--------|------|
| 6 | **Dragon vs Tiger** | Live table · timed rounds · fake multiplayer | SkyRise round loop + bots, shared `PlayingCard`, Plinko/Keno qMax cap | 🟠 Medium-High | ✅ Live | [game-6-dragon-tiger.md](./game-6-dragon-tiger.md) · assets: [game-6-dragon-tiger-assets.md](./game-6-dragon-tiger-assets.md) |

**Why this order:** Limbo and Dragon Tower were near-free given the dice/mines code, so the catalogue widened fast. Andar Bahar closed a promise already shown in the lobby (the old `Cards` tile read *"Andar Bahar & Hi-Lo"* — now split into a standalone **Andar Bahar** game and a renamed **Hi-Lo** tile) and hits the core PKR market. Plinko and Keno were already on the public "Coming Soon" shelf, so they were committed to users.

Each game's spec doc ends with an **Implementation notes** section recording the decisions and corrections made during the build.

---

## The one rule every game must honour

The house-never-loses guarantee lives in **one** place:
`capWinProbabilityForHouseEdge(configuredPct, multiplier, houseEdge)` ([lib/game-engine.ts:114](../game-engine.ts)).

For every new game:

1. Resolve `{ winProbability, isPromo }` once via `getPlayerWinProbability(userId, amount)` **before** the DB transaction.
2. **Normal players:** clamp the effective win % so the house can't lose (see the cap note below).
3. **Promo players (`isPromo`):** use the raw win probability — the house may lose by design.
4. All financial settlement happens server-side inside a `db.transaction` with `SELECT ... FOR UPDATE` on the wallet row. The client is never trusted for amounts or multipliers.
5. Snapshot `win_probability` + `is_promo` onto the `game_rounds` row for reporting (see [admin-reporting-plan.md](./admin-reporting-plan.md)).

Bet limits: **min PKR 10, max PKR 20,000**, enforced server-side (see existing actions).

### ⚠️ Cap correction (learned building Plinko + Keno)

`capWinProbabilityForHouseEdge(pct, multiplier, edge)` caps against a *single* multiplier and is correct for the **binary win-or-nothing** games (Dice, Coin Flip, Limbo, Andar Bahar, Keno — a loss pays 0×).

It is **NOT safe** for games with **sub-1× "partial loss" buckets** (Plinko), because those buckets still pay out and add to EV. There the correct cap is derived from the per-config *expected* winning payout:

```
qMax = (1 − edge − B) / (A − B)     where A = E[mult | win buckets], B = E[mult | loss buckets]
```

This lives in `plinkoMaxWinPct(rows, risk)` and `kenoMaxWinPct(k)`. The original spec text in each doc said "cap against the max multiplier" — that was corrected to `qMax` for Plinko/Keno (see their Implementation notes). The `isWinRound`-gated games (Mines, Dragon Tower) need no per-multiplier cap at all — the player faces the real per-step odds, so EV ≤ 1 − edge automatically.

---

## Wiring checklist (the full set — confirmed across all 5 builds)

The original checklist missed several touch-points that the builds + reviews surfaced. This is the **complete** list a new game needs:

- [x] `lib/games-catalogue.ts` — add `GameSlug`, add to `LIVE_GAMES`, remove from `SOON_GAMES`
- [x] `lib/game-engine.ts` — provably-fair RNG + win-probability variant **and/or** a shared `lib/games/<slug>.ts` for config + payout math (Dragon Tower, Plinko, Keno use a shared pure module so client + server can't drift)
- [x] `lib/actions/games.ts` — a `placeBet` branch (single-shot, win-or-nothing games) **or** a dedicated action (multi-step: Dragon Tower; always-pays: Plinko)
- [x] `app/api/games/<slug>/route.ts` (+ `/reveal`, `/settle`) — **only** for games that don't use the shared `/api/games/bet` (Dragon Tower, Plinko). Limbo / Andar Bahar / Keno ride `/api/games/bet`.
- [x] `components/games/<slug>/<slug>-game.tsx` — UI wrapped in `GamesWrapper` (export named `XGame`; matched in `game-view.tsx`)
- [x] `components/games/games-wrapper.tsx` — add to the `GameType` union **and** the `GAME_RULES[<slug>]` entry
- [x] `components/lobby/game-view.tsx` — `dynamic()` import + `renderGame()` `case`
- [x] `components/protected/game-card-art.tsx` — lobby card SVG (`XArt`) + register in `components/lobby/lobby-grid.tsx` `GameArt`
- [x] `app/admin/reports/tabs/games-tab.tsx` — `EXPECTED_HOLD[<slug>]` (else the admin hold badge is blank)
- [x] `components/games/game-loading-screen.tsx` — `GAME_CONFIG[<slug>]` (name, tagline, accent, loading bg)
- [x] `app/admin/promotions/promotion-actions.tsx` — `LIVE_GAME_OPTIONS` entry so a promo CTA can target the game
- [x] `app/protected/games/<slug>/{page,loading}.tsx` — deep-link stub (`redirect("/?game=<slug>")`) + loading screen
- [x] `/api/games/history` — works via the `game_type` query param with **no change** (column is plain `text`)
- [x] When the last `SOON_GAMES` entry launches, the lobby's "Coming Soon" section auto-hides (guarded on `SOON_GAMES.length > 0`)

---

## Asset tooling reference

This is the shared "buy vs generate" guide. The **per-game asset breakdown** — what's already done in-house vs. the exact placeholder art/SFX still to commission, with paths and specs — lives in **[game-assets.md](./game-assets.md)**.

### Generate (free / cheap — preferred)

| Asset type | How | Tool |
|---|---|---|
| **Lobby card art (SVG)** | Hand-code like the existing `DiceArt`/`MinesArt` — on-brand, zero cost, scales perfectly. For complex scenes, generate a raster concept then auto-trace to SVG. | Hand-code in `game-card-art.tsx`; concept → Midjourney / DALL·E / Recraft; trace via Illustrator / [vectorizer.ai](https://vectorizer.ai) / Recraft "vectorize" |
| **In-game icons** | Already a dependency — use first. | `lucide-react` (installed), [Iconify](https://iconify.design), [SVGRepo](https://www.svgrepo.com) (many CC0) |
| **Playing cards** | **Render programmatically** — reuse Hi-Lo's `PlayingCard` + `SUITS` + `RANK_LABEL` ([hi-lo-game.tsx](../../components/games/hi-lo/hi-lo-game.tsx)). Zero image assets, infinitely scalable. | In-house React/SVG. Fallback vector decks: Kenney "Playing Cards Pack" (CC0), Chris Aguilar "Vectorized Playing Cards 3.2" (LGPL) |
| **SFX (clicks, reveals, wins)** | Drop `.mp3` into `public/sounds/`, wire via the `lib/sound.ts` pattern. Generate arcade blips procedurally, or grab royalty-free. | [jsfxr](https://sfxr.me) / Bfxr (generate), [Pixabay](https://pixabay.com/sound-effects/), [Mixkit](https://mixkit.co/free-sound-effects/), freesound.org |
| **Win / celebratory animation** | `lib/confetti.ts` + `lib/haptics.ts` already exist — reuse them. Lottie JSON for richer effects. | Existing helpers; [LottieFiles](https://lottiefiles.com) (free packs) |
| **3D objects** | Three.js is already used (dice, coin). Pull CC0 models if needed. | Three.js / R3F; models from [Poly Pizza](https://poly.pizza) (CC0), Sketchfab (filter CC0) |

### Purchase (when a premium look is worth it)

| Need | Where |
|---|---|
| Casino UI kits, chip/coin packs, polished card faces | Envato / GraphicRiver, [UI8](https://ui8.net) |
| Stock vectors / illustrations | Adobe Stock, Shutterstock, Freepik (premium) |
| Game-ready art packs | itch.io asset packs; [Kenney.nl](https://kenney.nl) (CC0, donation-ware) |

> **Default stance:** every game below can ship with **generated/in-house assets only**. Purchases are optional polish, flagged per game where they'd have the most impact.
