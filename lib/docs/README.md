# BetPulse — Games Architecture & Server Flow

## Table of Contents
1. [Win Probability System](#win-probability-system)
2. [Dice 3D](#dice-3d)
3. [Coin Flip](#coin-flip)
4. [SkyRise (Crash)](#skyrise-crash)
5. [Mines](#mines)
6. [Bet Limits](#bet-limits)

---

## Win Probability System

**Single source of truth:** `lib/player-win-probability.ts`

```
DEFAULT_WIN_PROBABILITY = 20   ← change this one constant to adjust all normal players globally
```

| Player type | Win probability source | House-edge cap |
|---|---|---|
| Normal player | matching `bet_amount_tiers` row, else `DEFAULT_WIN_PROBABILITY` (20%) | **Applied** — win prob is clamped per-game so the house never loses |
| Promotion player | `promotion_players.win_probability_boost` (set per-player in admin panel) | **Bypassed** — exact win prob is honoured, house may lose by design |

`getPlayerWinProbability(userId, betAmount)` returns `{ winProbability, isPromo }`. It queries `promotion_players` for an active row (→ `isPromo: true`); otherwise matches the bet amount to a tier, falling back to `DEFAULT_WIN_PROBABILITY` (→ `isPromo: false`).

`isPromo` is the switch each game uses to decide whether to call `capWinProbabilityForHouseEdge` (normal players) or use the raw win probability (promo players). This is resolved **once per bet** in `lib/actions/games.ts` before the transaction, then passed into the RNG layer. No game component has access to the raw probability — it is server-side only.

---

## Dice 3D

### How a player plays
1. Set bet amount (PKR 10 – 20,000).
2. Choose a target number (0.00 – 99.99) and a side: **Over** or **Under**.
3. Click **Roll**. The server resolves the roll immediately and returns the result.
4. The 3D dice animates to show the rolled number.

### Win condition
- Over: `roll > target`
- Under: `roll < target`

### Payout formula
```
multiplier = (1 - 0.01) / winChance
winChance  = (99 - target) / 100   for Over
           = target / 100           for Under
```

### Server flow

```
Client                          Server (lib/actions/games.ts → placeBet)
  │                                │
  │── POST /api/games/bet ─────────▶│
  │   { gameType: "dice",           │  1. Auth check
  │     amount, choice:             │  2. Lock wallet row (SELECT FOR UPDATE)
  │     { target, side } }          │  3. Get win probability (getPlayerWinProbability)
  │                                 │  4. Generate server seed (crypto.randomBytes)
  │                                 │  5. rollDiceWithProbability()
  │                                 │     - float1 (HMAC bytes 0-3): decides win vs loss
  │                                 │     - float2 (HMAC bytes 4-7): picks value in zone
  │                                 │     Win zone  (Over 50): roll ∈ (50.01, 99.99]
  │                                 │     Loss zone (Over 50): roll ∈ [0.00, 50.00]
  │                                 │  6. Calculate payout, debit/credit wallet
  │                                 │  7. Insert game_round + bet + transaction
  │◀─ { won, roll, multiplier, ────│
  │    payout, newBalance }         │
```

**Key files:**
- `app/api/games/bet/route.ts` — entry point
- `lib/actions/games.ts → placeBet()` — main logic
- `lib/game-engine.ts → rollDiceWithProbability()` — RNG
- `components/games/dice-3d/dice-3d-game.tsx` — UI
- `components/games/dice-3d/three-canvas.tsx` — 3D dice render (Three.js)

---

## Coin Flip

### How a player plays
1. Set bet amount (PKR 10 – 20,000).
2. Click **Heads** or **Tails**.
3. The coin flips (Three.js animation) and lands on the server-determined side.

### Win condition
`result === pick`

### Payout
Fixed `1.96×` (2% house edge on a 50/50 game).

### Server flow

```
Client                          Server
  │                                │
  │── POST /api/games/bet ─────────▶│
  │   { gameType: "coinflip",       │  1. Auth + wallet lock
  │     amount,                     │  2. getPlayerWinProbability()
  │     choice: { pick } }          │  3. flipCoinWithProbability()
  │                                 │     - if float < winPct/100 → return pick (win)
  │                                 │     - else → return opposite (loss)
  │                                 │  4. Persist + update wallet
  │◀─ { won, result, multiplier, ──│
  │    payout, newBalance }         │
```

**Key files:**
- `app/api/games/bet/route.ts`
- `lib/actions/games.ts → placeBet()`
- `lib/game-engine.ts → flipCoinWithProbability()`
- `components/games/coin-flip/coinflip-game.tsx`
- `components/games/coin-flip/coin-canvas.tsx` — 3D coin (Three.js)

---

## SkyRise (Crash)

### How a player plays
1. During the **5-second betting window**, set up to **2 bet slots** (A and B), each with an amount and optional auto-cashout multiplier.
2. When the countdown ends, the rocket launches. A multiplier grows exponentially.
3. Click **Cash Out** before the rocket crashes to win `amount × multiplier`.
4. If the multiplier hits the crash point before cashout → lose the bet.

### Win condition
`cashedOutAt < crashAt`

Auto-cashout: server generates `crashAt` above the player's target (win) or below it (loss).

### Server flow

```
Client                          Server
  │                                │
  │  [Countdown hits 0]            │
  │── POST /api/games/skyrise ─────▶│
  │   { bets: [                     │  1. Auth + wallet lock
  │     { amount, autoCashoutAt }   │  2. getPlayerWinProbability()
  │   ] }                           │  3. genSkyRiseCrashAt():
  │                                 │     - With auto-cashout targets:
  │                                 │       Win  → crashAt > max(targets)
  │                                 │       Loss → crashAt < min(targets)
  │                                 │     - No auto-cashout:
  │                                 │       Win  → crashAt ∈ [2×, 10×]
  │                                 │       Loss → crashAt ∈ [1.00×, 1.70×]
  │                                 │  4. Deduct total bet from wallet
  │                                 │  5. Store pending game_round
  │◀─ { roundId, crashAt, ─────────│
  │    newBalance }                 │
  │                                 │
  │  [Flight animation using        │
  │   server's crashAt]             │
  │                                 │
  │  [Round ends: crash or cashout] │
  │── POST /api/games/skyrise/ ─────▶│
  │        settle                   │  1. Look up pending round (verify userId)
  │   { roundId,                    │  2. Calculate payouts
  │     betOutcomes: [              │  3. Credit winnings to wallet
  │       { amount,                 │  4. Insert bet records
  │         cashedOutAt }           │  5. Mark round completed
  │     ] }                         │
  │◀─ { newBalance } ───────────────│
```

**State machine:**
```
betting → [API call] → flight → crash → post → betting
                ↑ crashAt from server        ↑ settle API called here
```

**Live bets & simulated players:** Generated client-side from a round seed (`randomBets(roundSeed)`). These are cosmetic — they do not go through the server.

**Key files:**
- `app/api/games/skyrise/route.ts` — start round
- `app/api/games/skyrise/settle/route.ts` — settle round
- `lib/actions/games.ts → startSkyRiseRound(), settleSkyRiseRound()`
- `components/games/skyrise/sky-rise-game.tsx` — main game logic
- `components/games/skyrise/scene.tsx` — flight curve + multiplier readout
- `components/games/skyrise/bet-card.tsx` — bet slot UI

---

## Mines

### How a player plays
1. Set bet amount (PKR 10 – 20,000) and mine count (3 / 5 / 10 / 25).
2. Click **Bet** — server deals the board.
3. Click tiles on the 5×5 grid to reveal gems (safe) or mines.
4. Each safe tile increases the multiplier. Click **Cash Out** at any point to lock in winnings.
5. Hitting a mine ends the round — full bet is lost.

### Win condition
Click **Cash Out** before hitting a mine.

### Payout multiplier formula
```
multiplier = (1 - 0.01) × C(25, k) / C(25 - mines, k)
```
Where `k` = number of safe tiles revealed, `C(n,k)` = binomial coefficient.

### Win probability — mine placement bias

| Round type | Mine placement |
|---|---|
| **Win round** | All mines placed in the **outer ring** (16 tiles). Center 9 tiles (6,7,8,11,12,13,16,17,18) are guaranteed safe. |
| **Loss round** | At least **one mine guaranteed in the center 9** — the tiles most commonly clicked first. |
| High mine count (>16) | Random placement (can't fit all mines in outer ring). |

### Server flow

```
Client                          Server
  │                                │
  │── POST /api/games/mines ───────▶│
  │   { amount, minesCount }        │  1. Auth + wallet lock
  │                                 │  2. getPlayerWinProbability()
  │                                 │  3. Decide win/loss (Math.random < winPct/100)
  │                                 │  4. genMinePositions() → biased layout
  │                                 │  5. Deduct amount from wallet
  │                                 │  6. Store pending round (mineSet in outcome JSONB)
  │◀─ { roundId, mineSet,  ────────│
  │    seedHash, newBalance }       │
  │                                 │
  │  [Player clicks tiles           │
  │   using client-side mineSet     │
  │   — instant, no per-tile API]   │
  │                                 │
  │  [Cashout or mine hit]          │
  │── POST /api/games/mines/ ───────▶│
  │        settle                   │  1. Look up pending round (verify userId)
  │   { roundId,                    │  2. Calculate payout from safeRevealed
  │     outcome: "cashed"|"lost",   │  3. Credit wallet if cashed
  │     safeRevealed,               │  4. Insert bet record
  │     amount }                    │  5. Mark round completed, reveal server seed
  │◀─ { newBalance, mineSet } ──────│
```

**Provably fair display:** The `seedHash` (SHA-256 of server seed) is shown in the "Provably Fair" strip before the round. After settling, the full `mineSet` is available for verification. A player could in principle use the server's returned `mineSet` to verify the layout matched the hash — though full seed reveal is not yet implemented in the UI.

> **Note on client trust:** The `mineSet` is sent to the client at round start so tile reveals are instant (no per-click API latency). A technical player could extract mine positions from the network response. This is an acceptable trade-off for a startup — the server still controls which layout the player gets (win probability), and all financial settlement is server-side.

**Key files:**
- `app/api/games/mines/route.ts` — start round
- `app/api/games/mines/settle/route.ts` — settle round
- `lib/actions/games.ts → startMinesRound(), settleMinesRound()`
- `components/games/mines/mines-game.tsx` — full game UI + logic

---

## Bet Limits

| Limit | Value | Enforced in |
|---|---|---|
| Minimum bet | PKR 10 | `placeBet()`, `startMinesRound()`, client validation |
| Maximum bet | PKR 20,000 | `placeBet()`, `startMinesRound()`, `startSkyRiseRound()`, `MAX_BET` in each component |

The server is the authoritative source — client-side limits are UX only.

---

## Database Tables (game-related)

| Table | Purpose |
|---|---|
| `game_rounds` | One row per round. `outcome` JSONB stores game-specific data (roll, mineSet, crashAt, etc.). `status` is `"pending"` during play, `"completed"` after. |
| `bets` | One row per bet per round. Links `user_id → round_id`. Stores `amount`, `payout`, `profit`, `choice`. |
| `wallets` | User balance. Updated atomically inside the same DB transaction as bet/payout. |
| `transactions` | Ledger log of every balance change. |
| `promotion_players` | Active promotion entries. `win_probability_boost` (0–100) overrides `DEFAULT_WIN_PROBABILITY`. |
