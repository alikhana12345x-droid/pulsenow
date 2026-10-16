# Game 1 — Limbo

> **Build order:** 1 of 5 · **Effort:** 🟢 Low · **Status:** Not built
> **Reuses:** the Dice engine almost verbatim (`rollDiceWithProbability`, `capWinProbabilityForHouseEdge`).
> **Slug:** `limbo` · **House edge:** 1%

Limbo is Dice stripped to its essence: the player sets a **target multiplier**, one number is rolled, and they win if the rolled multiplier is at or above their target. No slider, no over/under — just "how high dare you go." It's the cleanest possible multiplier game and a natural companion to Skyrise.

---

## How a player plays

1. Set bet amount (PKR 10 – 20,000).
2. Set a **target multiplier** (`1.05×` – `1000×`, enforced on both client and server — the upper bound caps max payout exposure).
3. Press **Roll**. The server resolves instantly and returns a **result multiplier**.
4. Win if `result ≥ target`; payout is `bet × target`.

## Win condition

```
result ≥ target   →   win, payout = bet × target
result <  target   →   loss
```

## Payout / fair odds

```
fair P(win) = (1 − houseEdge) / target          // 1% edge
multiplier  = target (player-chosen)
EV          = P(win) × target = 1 − houseEdge    // house keeps the edge
```

Because the player picks the multiplier, the effective win probability **must** be capped. Limbo is mechanically identical to Dice, so it uses Dice's **0.20** cap (≥20% effective edge for normal players) — **not** the 1% fair-odds edge shown above. The 1% only governs the *displayed* win chance / multiplier; the real house protection is the 0.20 cap, exactly as in `placeBet`'s dice branch:

```
effectiveWinPct = isPromo
  ? winProbability
  : capWinProbabilityForHouseEdge(winProbability, target, 0.20)   // mirrors Dice
```

A target of `100×` therefore caps a normal player's win chance at `(1 − 0.20) × 100 / 100 = 0.80%`, giving EV `0.80` (20% hold). Reporting uses `EXPECTED_HOLD.limbo = 0.20`, matching Dice. (Earlier drafts of this doc said `0.01`; that was wrong — Dice does not cap at 1%.)

## Engine function (new, in `lib/game-engine.ts`)

Mirror `rollDiceWithProbability`: float1 decides win/loss, float2 picks the displayed value inside the resulting zone.

Returns `{ result, won }` — `won` is authoritative (callers must not re-derive it from the rounded `result`, whose 2-dp rounding could straddle the boundary). The loss zone is clamped strictly below `target` for the same reason.

```ts
export function rollLimboWithProbability(
  serverSeed, clientSeed, nonce,
  effectiveWinPct, target, maxMultiplier = 1_000_000,
): { result: number; won: boolean } {
  const won = generateFloat(serverSeed, clientSeed, nonce) < effectiveWinPct / 100;
  const r   = generateFloat2(serverSeed, clientSeed, nonce);
  if (won) {
    // win zone: [target, maxMultiplier] — skewed so most wins land near target
    const raw = target / (1 - r * (1 - target / maxMultiplier));
    return { result: Math.max(target, parseFloat(raw.toFixed(2))), won };
  }
  // loss zone: [1.00, target) — clamped below target so rounding can't reach it
  const span = Math.max(0, target - 1.01);
  let result = parseFloat((1 + r * span).toFixed(2));
  if (result >= target) result = parseFloat((target - 0.01).toFixed(2));
  return { result, won };
}
```

## Server flow

Single transaction — extend `placeBet()` in `lib/actions/games.ts` with a `gameType: "limbo"` branch (no new round/reveal/settle endpoints needed).

```
Client                          Server (placeBet, gameType "limbo")
  │                                │
  │── POST /api/games/bet ─────────▶│  1. Auth + wallet lock (FOR UPDATE)
  │   { gameType: "limbo",          │  2. getPlayerWinProbability()
  │     amount,                     │  3. capWinProbabilityForHouseEdge(winPct, target, 0.01)
  │     choice: { target } }        │  4. rollLimboWithProbability()
  │                                 │  5. won = result >= target
  │                                 │  6. payout = won ? amount*target : 0
  │                                 │  7. Persist game_round + bet + transaction
  │◀─ { won, result, multiplier, ──│
  │    payout, newBalance }         │
```

## Files to create / touch

- `lib/game-engine.ts` — `rollLimboWithProbability()`
- `lib/actions/games.ts` — add `"limbo"` branch to `placeBet` (`choice = { target }`, `houseEdge = "0.0100"`)
- `app/api/games/bet/route.ts` — accept `gameType: "limbo"` (likely already generic)
- `components/games/limbo/limbo-game.tsx` — UI (target input, big result readout)
- `components/games/games-wrapper.tsx` — `GAME_RULES.limbo`
- `lib/games-catalogue.ts` — add slug; promote from `SOON_GAMES` on launch
- `components/protected/game-card-art.tsx` — `LimboArt` + register in `lobby-grid.tsx`

## Assets required

See the [asset tooling reference](./games-roadmap.md#asset-tooling-reference) for the buy-vs-generate guide.

| Asset | Description | Recommendation |
|---|---|---|
| **Lobby card art** | A rising multiplier line/graph or rocket-to-the-moon vector | **Generate** — hand-code `LimboArt` SVG (a glowing upward curve + `×` readout). On-brand, no cost. |
| **Result readout** | Large animated multiplier number (count-up to result), green on win / red on loss | **Generate** — pure CSS/JS count-up; no asset. |
| **Background motif** | Faint grid / star-field behind the number | **Generate** — reuse the dot-grid SVG pattern from `DiceArt`. |
| **SFX** | `roll` whoosh, `win` chime, `lose` thud | **Generate/free** — jsfxr or Pixabay; drop in `public/sounds/`, wire via `lib/sound.ts`. |
| **Win celebration** | Confetti on big wins | **Reuse** — `lib/confetti.ts` + `lib/haptics.ts`. |

**Purchase:** none needed. Limbo is text-and-motion heavy; in-house SVG + procedural SFX fully cover it.

## Build checklist

- [x] `rollLimboWithProbability` (returns `{ result, won }`) — `lib/game-engine.ts`
- [x] `placeBet` `"limbo"` branch with `0.20` house-edge cap — `lib/actions/games.ts`
- [x] `limbo-game.tsx` with log-scaled target slider + presets + animated readout
- [x] `GAME_RULES.limbo` + `GameType` union — `games-wrapper.tsx`
- [x] `LimboArt` + lobby registration — `game-card-art.tsx`, `lobby-grid.tsx`
- [x] Lazy-import route — `components/lobby/game-view.tsx`
- [x] Deep-link stub + loading screen — `app/protected/games/limbo/`
- [x] `EXPECTED_HOLD.limbo = 0.20` — `app/admin/reports/tabs/games-tab.tsx`
- [x] Promote to `LIVE_GAMES`, remove from `SOON_GAMES` — `games-catalogue.ts`
- [x] Admin promo CTA option (`game:limbo`) — `app/admin/promotions/promotion-actions.tsx`
- [x] Server target guard tightened to `[1.05, 1000]` to bound max payout exposure
- [x] Verified: tsc + eslint clean; 4M-sample sim → house hold always ≥0 (EV ≤ 0.83), `won ⇔ result ≥ target` holds, promo bypass works
- [ ] (follow-up assets) Dedicated `/brand/loading/limbo.png`, `/brand/promotions/games/limbo.png` (3:1) + a "Limbo Launch" promo template, and limbo-specific SFX/bg loop
