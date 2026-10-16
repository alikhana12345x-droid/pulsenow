# BetPulse — Next 5 Games (shortlist)

> **Status: 📋 Proposed — nothing built yet.** Basic info only; each game gets its own
> full spec doc (`game-7-*.md` … `game-11-*.md`) before build, in the format of
> [game-6-dragon-tiger.md](./game-6-dragon-tiger.md).
> Companion to [games-roadmap.md](./games-roadmap.md) (games 1–6, all shipped).

---

## Why these five

The catalogue is at **11 live games** ([lib/games-catalogue.ts](../../games-catalogue.ts)), and the
two most-played are **Aviator** and **Dragon vs Tiger** — the only two built as
**shared timed rounds with a visible crowd** (countdown, everyone on the same round, bots
on screen). The other nine are solo instant-play. Four of the five below reuse that
round-loop architecture directly; the fifth (Slots) fills the one category the platform
has none of.

---

## The shortlist

| # | Game | Archetype | Reuses | Effort | Cap type |
|---|------|-----------|--------|--------|----------|
| 7 | **Color Prediction (Win Go)** | Timed round · pick colour/number | Dragon-Tiger loop, bet zones, chip rack | 🟢 Low | binary |
| 8 | **Teen Patti (20-20)** | Timed round · A vs B card table | Dragon-Tiger loop, shared `PlayingCard` | 🟢 Low | binary |
| 9 | **Roulette (European)** | Timed round · wheel spin | Round loop + chip rack; wheel is new | 🟡 Medium | binary |
| 10 | **Baccarat** | Timed round · Player/Banker/Tie | Dragon-Tiger loop, shared `PlayingCard` | 🟡 Medium | binary |
| 11 | **Slots** | Reel spin · paytable | New (reel engine + art) | 🟠 High | **qMax** |

**Build order:** 7 → 8 → 9 → 10 → 11. The first two are close to free given Dragon vs Tiger
and are the two the PK/IN market plays most; Slots goes last because it's art-blocked, not
code-blocked.

---

### 7. Color Prediction (Win Go)

The single most-played betting game in the PK/IN app market right now (TC Lottery / 91 Club /
Daman clones). 1-minute rounds, one digit `0–9` drawn per round.

- **Bets:** Green · Red · Violet · Big (5–9) · Small (0–4) · exact number
- **Payouts:** colour & big/small **1.96×** · violet **4.5×** · exact number **9×**
- **Key rule:** `0` and `5` are the violet overlap — `0` = Red+Violet, `5` = Green+Violet.
  A colour bet that lands on its overlap digit pays a reduced **1.5×**.
- **Notes:** no card art, no physics — the whole game is a countdown, a bet grid and a
  number reveal. Cheapest game on this list to build.

### 8. Teen Patti (20-20)

The #1 card game in South Asia. Use the **table variant** — two dealt hands, players bet a
side — *not* the multiplayer poker version (no seat management, no server-authoritative
turn order).

- **Bets:** Player A · Player B (optional later: Pair-Plus side bet)
- **Payouts:** A / B **1.96×**
- **Rules:** 3 cards each, best hand wins.
  Trail > Pure Sequence > Sequence > Colour > Pair > High Card.
- **Notes:** structurally identical to Dragon vs Tiger — same round loop, same bet zones,
  same reveal beat, just 3 cards a side and a hand-ranking function instead of a rank compare.

### 9. Roulette (European)

Universal top-3 casino game in every market; the platform has no wheel game at all.

- **Layout:** single zero, 37 pockets (`0`, `1–36`)
- **Payouts:** straight **36×** · split **18×** · street **12×** · corner **9×** ·
  dozen / column **3×** · red-black / odd-even / high-low **2×**
- **Notes:** the bet grid is the real work (many bet types, chip placement per cell), not
  the spin. Wheel can be CSS/SVG or Three.js — R3F is already a dependency (dice, coin).

### 10. Baccarat

Highest-handle casino game in Asia. Natural graduation path for Dragon vs Tiger players —
same rhythm, one step deeper.

- **Bets:** Player · Banker · Tie
- **Payouts:** Player **2×** · Banker **1.95×** (5% commission) · Tie **9×**
- **Rules:** two cards a side, totals mod 10, plus the standard third-card draw rule
  (the only genuinely new logic here — encode it as a lookup table).

### 11. Slots

Globally the #1 category by revenue, and BetPulse has none. Target a
**tumbling / cluster-pays** feel (Sweet Bonanza style) rather than classic paylines — it
reads better on mobile and animates from a single symbol grid.

- **Shape:** 6×5 grid, cluster pays, cascading drops, multiplier symbols
- **Payouts:** driven by a symbol paytable, not a single multiplier
- **⚠️ Cap:** this is the **only game on the list that can't use
  `capWinProbabilityForHouseEdge`.** Like Plinko, it has sub-1× and multi-tier paying
  outcomes, so it needs a `qMax`-style EV cap (`slotsMaxWinPct(...)`) derived from the
  expected payout across the whole paytable. Decide this **before** the reels are drawn —
  see the cap correction note in [games-roadmap.md](./games-roadmap.md#-cap-correction-learned-building-plinko--keno).
- **Notes:** the only art-heavy game here — needs a symbol set (~10 symbols + scatter),
  win animations, and a bg. Everything else on this list ships on generated/in-house assets.

---

## Before locking the order

This ranking is based on market popularity, not BetPulse's own numbers. The `game_rounds`
table can tell you *why* Aviator and Dragon vs Tiger lead — round count, staked volume and
session length are three different answers and would point at different next games. Worth
pulling from the admin reports ([app/admin/reports/tabs/games-tab.tsx](../../../app/admin/reports/tabs/games-tab.tsx))
before committing.

## Shared requirements (all five)

Every game still honours the one rule and the full wiring checklist in
[games-roadmap.md](./games-roadmap.md):

- Resolve `{ winProbability, isPromo }` once via `getPlayerWinProbability()` before the DB transaction
- Clamp for normal players, raw for promo players
- Settle server-side in a `db.transaction` with `SELECT … FOR UPDATE` on the wallet row — never trust the client for amounts or multipliers
- Snapshot `win_probability` + `is_promo` onto the `game_rounds` row
- Bet limits **PKR 10 – 20,000**, enforced server-side
