# Game 6 — Dragon vs Tiger (Live Table)

> **Build order:** 6 · **Effort:** 🟠 Medium-High · **Status:** ✅ Built (see Implementation notes)
> **Reuses:** SkyRise's continuous-round loop + fake-multiplayer patterns, shared `PlayingCard`, confetti/haptics/sound helpers
> **Slug:** `dragon-tiger` · **game_type:** `dragon-tiger` · **House edge:** 5% (portfolio-capped)
> **Companion doc:** [game-6-dragon-tiger-assets.md](./game-6-dragon-tiger-assets.md) — every art/SFX asset + the exact generation prompts.

Dragon vs Tiger is the single most-played "live" card game in the PK/IN casino-app market
(Teen Patti Master et al.). One card is dealt to **Dragon**, one to **Tiger**; the higher
card wins. Players bet on Dragon (1:1), Tiger (1:1) or Tie (8:1) during a shared countdown,
surrounded by a crowd of other "players" betting live.

**The clone target is the attached reference screenshots — the goal is a 1:1 match of
layout, phases, timings, and behaviour**, implemented on BetPulse's existing per-client
round architecture (like SkyRise: the "live table" is a simulation; the server is only
involved when the player's own money is at stake).

---

## 1. Reference anatomy (what each screenshot shows)

**State A — betting open (`Start Betting 14`):**

| Region | Contents |
|---|---|
| Top-left | tiny version + table-ID text (cosmetic — we render our own build tag + round id) |
| Top-centre | two **face-down cards** side by side with a flaming **VS** emblem between them; Dragon hero art (azure/white Chinese dragon) charges in from the left, Tiger hero art (flame-gold tiger) from the right |
| Phase banner | gold-trimmed pill under the cards: `Start Betting 14` — counts down 15 → 0, once per second |
| History bar | horizontal strip: coloured result badges, oldest → newest (left → right). **D** = blue hexagon, **T** = gold hexagon, **Tie** = green badge labelled `Tie` (full word so it can't be confused with Tiger's `T`). Newest badge carries a small red corner marker. A blue **trend** button (chart icon) sits at the right end |
| Bet zones | three tall rounded panels: **Dragon 1:1** (indigo/blue, dragon watermark), **Tie 8:1** (green), **Tiger 1:1** (gold/amber, tiger watermark) |
| Rate bar | under the Tie zone: ⭐ `Rate:70%` pill + a small **D ↔ T slider** showing where the round's money is leaning |
| Side rosters | 3 avatar slots down the **left** edge and 3 down the **right** — top bot players with coin balances; #1 on each side wears a crown frame. Mix of real-looking names (`Chandra`) and `Guest######` |
| Bottom bar | player avatar + PKR balance (left) · **chip rack** `10 / 50 / 100 / 500 / 1000` + `>` arrow that expands to `5000 / 10000` (centre) · orange **Continue** button (right) |
| Bottom-left | green "players" button (person icon) — opens the full live-players drawer |

**State B — bets flying (`Start Betting 9`):**

- Each zone now shows its **total staked** in a dark strip at the top (`10970.00`, `200.00`, `7230.00`) — bots + player combined.
- Dozens of **mini chip sprites** are scattered inside each zone (chips visibly fly in as bots bet).
- The **player's own stake** on a zone renders separately at the bottom of that zone (`1400.00` on Tiger).
- Player balance already reflects placed chips (5,265.84 → 3,865.84 after 1,400 staked).

**State C — reveal (`Free Time 2`):**

- Banner switches to `Free Time N` (countdown to next round) the instant betting ends.
- Both cards flip face-up; the dragon and tiger heroes **clash across the centre** with a
  large VS burst; the winning side's art sweeps over the table.
- Winning zone glows; losing chips are swept away; winning chips pay out (fly toward
  their owners); player balance counts up on a win (3,865.84 → 10,262.84).
- History bar appends the new result; then the next `Start Betting` round begins automatically. The loop never stops.

---

## 2. Game rules

- Single 52-card deck semantics, freshly "shuffled" every round (no shoe tracking).
- **Ranking:** A low → K high (`A=1, 2…10, J=11, Q=12, K=13`). Suits never affect the outcome.
- One card to Dragon, one to Tiger. Higher rank wins. Same rank (any suits) = **Tie**.
- **Payouts (total return per 1 staked):**

| Zone | Label | Return | Net |
|---|---|---|---|
| Dragon | `1:1` | 2× | +1× |
| Tiger | `1:1` | 2× | +1× |
| Tie | `8:1` | 9× | +8× |

- On a **Tie**, Dragon and Tiger stakes are **lost in full** (matches the reference app;
  the softer real-casino "half refund" variant stays behind a `DT_TIE_REFUND_HALF = false`
  flag — do not enable without re-deriving the cap in §5).
- **Multi-zone betting is allowed** — any combination of the three zones in one round.
- Bet limits: chips are integers; **round total min PKR 10, max PKR 20,000**, enforced
  server-side like every other game.

---

## 3. Round loop & timing (client state machine)

Continuous per-client rounds, SkyRise-style ([sky-rise-game.tsx](../../components/games/skyrise/sky-rise-game.tsx)):
rounds run forever whether or not the player bets; `requestAnimationFrame` + wall-clock
elapsed time (NO hidden-tab freezing — tab away and the table moves on without you).

```
        ┌──────────────────────────────────────────────────────────────┐
        ▼                                                              │
  BETTING (15s, "Start Betting N")                                     │
   · chips clickable, bots trickle bets, totals + rate bar tick        │
   · t−1.0s: BETS LOCK → if player staked, POST /api/games/            │
     dragon-tiger (prefetch; response stashed)                         │
        │  countdown hits 0                                            │
        ▼                                                              │
  REVEAL + FREE TIME (8s, "Free Time N")                               │
   · 0.0–0.4s  zones dim, "stop betting" shimmer                       │
   · 0.4–1.6s  card flips: Dragon first, then Tiger (0.6s each)        │
   · 1.6–2.8s  winner clash sweep (dragon surge / tiger pounce /       │
               green Tie burst), winner zone starts pulsing            │
   · 2.8–4.4s  settlement animation: losing chips swept off-table,     │
               winning chips + payout stacks fly to their owners,      │
               player balance counts up, +PKR toast on win             │
   · ~4.5s     history badge appended (with red "new" marker)          │
   · 4.4–8.0s  idle; "Free Time" counts down to 0 ──────────────────────┘
```

- Constants in `lib/games/dragon-tiger.ts`: `DT_BETTING_SECONDS = 15`,
  `DT_FREE_SECONDS = 8`, `DT_BETS_LOCK_SECONDS = 1.0` (mirror SkyRise's
  `BETS_LOCK_SECONDS` prefetch trick so the flip starts the instant the bar empties;
  if the server response is late, hold the shimmer at flip-start until it lands).
- **Round number**: wall-clock derived exactly like SkyRise's `clockRoundNumber()`
  (`(now − epoch) / 23s`), so two devices opened together show ~the same round id and
  the number is never static. Shown in the cosmetic top-left overlay.
- **Phase banner strings are exactly** `Start Betting {n}` and `Free Time {n}` — copy the reference.

---

## 4. UI spec (piece by piece)

Wrap in **`GamesNativeWrapper`** (`name="Dragon vs Tiger"`, `subtitle="Live · Cards"`,
`gameType="dragon-tiger"`) — same chrome as SkyRise: balance header, rules / records /
sound / fullscreen menu, offline guard, deposit hook. `isPlaying` = player has chips in
the current unresolved round (from first chip until payout lands).

### 4.1 Stage & heroes
- Full-bleed arena background (`/public/games/dragon-tiger/bg-table.webp`) — night
  temple: cold blue half (left), warm ember half (right). See assets doc.
- `dragon-hero.webp` (left, faces right) and `tiger-hero.webp` (right, faces left)
  positioned above the card slots; idle animation = slow 6s float/breathe loop (CSS).
- Two card slots top-centre with the ornate `card-back.webp`; VS emblem between them.
  Card flip = 3D CSS rotateY 0.6s; face rendering **reuses the shared programmatic
  [`PlayingCard`](../../components/games/_shared/playing-card.tsx)** inside a gold frame — zero card-face images.
- Clash: winner's hero scales + sweeps toward centre behind a large `vs-burst.webp`
  flash; loser dims. Tie: both sweep, green flash. (Pure CSS/transform choreography.)

### 4.2 Bet zones
- Three panels in one row (Dragon / Tie / Tiger), rounded-2xl, inner watermark art,
  header strip that shows the zone **total** once > 0.
- **Placing a bet:** select a chip (rack, §4.5) → tap a zone → chip flies from the rack
  to a random point inside the zone (200ms arc), zone total + rate bar update, balance
  decrements locally, `chip-place` SFX + `hapticTap()`. Repeat taps stack.
- Player's own stake per zone renders in a gold pill pinned to the zone's bottom edge.
- Zone caps: taps that would push the round total past PKR 20,000 (or past balance) are
  rejected with a shake + toast (insufficient balance opens the `DepositSheet`, like SkyRise).
- Mini chip sprites: render at most ~40 per zone (older sprites merge into the total —
  keeps DOM cheap while totals keep counting).
- **No undo** — once a chip lands it's staked for the round (matches reference).
- During `Free Time` the zones are locked (pointer-events off, slight dim).

### 4.3 History bar + trend modal
- Keep the last **60** results in memory; render the most recent ~18, horizontally
  scrollable, oldest→newest. Badge spec: `D` blue hexagon, `T` gold hexagon, `Tie`
  green rounded badge with the full word. Newest badge = small red corner sash.
- Trend button (blue, chart icon) opens a modal: bead-road grid (6-row columns, the
  classic baccarat layout) of the last 60 + counters `D n · T n · Tie n` with %.
- History persists across rounds within the session (spectator + real rounds both append).

### 4.4 Rate bar
- Pill: ⭐ `Rate:NN%` + slim slider with `D` and `T` end caps.
- Semantics (reference is ambiguous — this reproduces its visuals): **share of the
  current round's Dragon+Tiger money sitting on the leading side.** Thumb position =
  dragon share; the leading side's letter lights up; `NN` = leading share.
  Between rounds it holds the last round's final value (that's why the reference shows
  `Rate:70%` at `Start Betting 14` before chips appear).

### 4.5 Chip rack & Continue
- Chips: `10 (green) · 50 (blue) · 100 (purple) · 500 (red) · 1000 (gold)` visible;
  `>` arrow expands the rack in-place to add `5000 · 10000`. Selected chip pops up
  (scale 1.15 + glow ring). Chip faces are a generated image set (assets doc) with an
  SVG fallback.
- **Continue** (orange, bottom-right) = **re-bet**: instantly re-places last round's
  full per-zone layout. Active look at all times (reference behaviour); tapping it when
  there's no previous layout / insufficient balance / outside betting phase shows a toast.
- Optional decoration next to Continue: gift-box icon → opens the promotions modal (phase 2, skippable).

### 4.6 Fake multiplayer (bots)
Deterministic per round from `mulberry32(roundSeed)` — reuse the generator patterns in
[live-bets-panel.tsx](../../components/games/skyrise/live-bets-panel.tsx) (`NAME_POOL`, weighted amounts).

- **Roster:** 24–48 bots/round. Names: ~30% human-style from `NAME_POOL`, ~70%
  `Guest` + 6–7 digits (matches reference). Each bot: avatar index (12-portrait pack),
  balance PKR 1,000–120,000 that **drifts round-to-round** with their cosmetic wins/losses.
- **Side rosters:** ranks 1–3 by balance down the left edge, 4–6 down the right;
  rank-1 of each column gets the crown frame. Balances tick up/down after settlement.
- **Bet stream:** each bot emits 1–5 chip placements at jittered times across the betting
  window (same trickle technique as SkyRise's roster reveal). Zone preference is biased
  ~47/47/6 (D/T/Tie) with a mild herd factor toward the side leading the rate bar.
  Bot chips animate exactly like player chips and drive zone totals + the rate bar.
- **Green players button** (bottom-left) opens a drawer listing the full bot roster +
  their current-round bets and totals (reuse the LiveBetsPanel look).
- Bots are **pure cosmetics** — they never touch the server or the player's odds.

### 4.7 Responsive / orientation
- Design canvas is landscape (reference is a landscape game). Desktop + landscape
  mobile: render the composition as-is (GamesNativeWrapper's mobile scale transform).
- Portrait: same components re-flowed — heroes+cards header (side rosters collapse to
  compact avatar+balance columns overlaying its left/right edges) → history → zones row
  (3 columns still fit) → rate bar → chip rack → bottom bar. No feature is dropped.

### 4.8 Sound & haptics
`/public/sounds/dragon-tiger/` (see assets doc): bg loop, chip-place, countdown final-5
ticks, card flip ×2, dragon roar / tiger growl / tie ding, clash impact, win chime +
coin shower. Wire via the SkyRise `<audio>` refs + `getSoundSettings()` /
`onSoundSettingsChange` pattern; `hapticTap` per chip, `hapticWin`/`hapticLoss` on
settle; `fireWinConfetti()` on player win (full coin-rain overlay for wins ≥ PKR 5,000).

---

## 5. Win-probability engine integration ⚠️ (read carefully — multi-zone)

One round = one **portfolio** `{ bD, bT, bTie }`, total stake `S`. This is NOT
win-or-nothing: with multiple zones a "losing" outcome can still return money (e.g.
`bD=100, bT=50` → Tiger wins returns 100 of 150). So the flat
`capWinProbabilityForHouseEdge` is **not safe** here — use the **qMax portfolio cap**,
the same correction Plinko/Keno documented in
[games-roadmap.md → Cap correction](./games-roadmap.md#️-cap-correction-learned-building-plinko--keno).

All math lives in a shared pure module **`lib/games/dragon-tiger.ts`** (client + server
import it, so they can't drift — same pattern as Plinko/Keno):

```ts
export const DT_HOUSE_EDGE = 0.05;
export const DT_PAYOUT = { dragon: 2, tiger: 2, tie: 9 };          // total-return multiples
export const DT_NATURAL = { dragon: 24/51, tiger: 24/51, tie: 3/51 }; // 1-deck odds: P(tie)=3/51
export type DtZone = "dragon" | "tiger" | "tie";
export type DtBets = Record<DtZone, number>;
```

**Per-unit return** of outcome `o`: `r(o) = R(o)/S` where `R(dragon)=2·bD`,
`R(tiger)=2·bT`, `R(tie)=9·bTie`.

**Win/loss sets:** `W = { o : r(o) > 1 }` (strictly net-positive), `L` = the rest
(break-even counts as loss — safety).

**Conditional means** (natural-weighted within each set):
`A = E[r | W]`, `B = E[r | L]`.

**The cap:**

```
EV(q) = q·A + (1−q)·B  ≤  1 − DT_HOUSE_EDGE
qMax  = (A ≤ B) ? 0 : clamp01((1 − DT_HOUSE_EDGE − B) / (A − B))     // W empty → 0
```

`dtMaxWinPct(bets)` returns `qMax·100`; `dtExpectedRtp(bets, pct)` returns
`(pct/100)·A + (1−pct/100)·B` for the `expected_rtp` snapshot.

Worked examples (must appear as unit tests):

| Portfolio | W | A | B | qMax |
|---|---|---|---|---|
| 100 Dragon | {D} | 2.0 | 0 | **47.5%** (≈ natural 47.06% — by design at 5% edge) |
| 100 Tie | {Tie} | 9.0 | 0 | **10.56%** |
| 100 D + 20 Tie | {D, Tie} | ≈1.648 | 0 | **57.6%** |
| 100 D + 100 T (hedge) | ∅ | — | ≈0.941 | **0%** → RTP 0.941 regardless, edge still holds |

**Resolution** (new fn in [lib/game-engine.ts](../game-engine.ts), exactly the
Plinko/Keno "decide first, dress the outcome after" shape):

```ts
export function resolveDragonTigerWithProbability(
  serverSeed: string,
  winProbabilityPct: number,           // ALREADY capped by the caller for non-promo
  bets: DtBets,
): {
  winner: DtZone;
  dragonCard: { rank: number; suit: number };  // rank 1..13, suit 0..3
  tigerCard:  { rank: number; suit: number };
  win: boolean;                        // net-positive round (→ is_win_round)
}
```

1. `rng = seededStream(serverSeed, "dragon-tiger")` (the existing helper).
2. `win = rng() < pct/100`; if `W` is empty, force `win = false` (holds for promo too —
   no net-positive outcome exists for a hedged book).
3. Sample the `winner` from `W` (on win) or `L` (on loss), weighted by renormalised
   `DT_NATURAL` — so D/T/Tie frequencies look natural within each set.
4. **Deal cards consistent with the winner:** Dragon wins → pick uniformly among the 78
   ordered rank pairs `(d > t)`; Tiger wins → mirror; Tie → one uniform rank, two
   distinct uniform suits. Suits uniform otherwise. The cards are presentation for an
   already-decided outcome — same doctrine as Andar Bahar / Plinko / Keno.

**Caller (server action):**

```ts
const { winProbability, isPromo } = await getPlayerWinProbability(userId, S);
const effectivePct = isPromo ? winProbability
                             : Math.min(winProbability, dtMaxWinPct(bets));
```

Default tier is 20% ([player-win-probability.ts](../player-win-probability.ts)) — under
the 47.5% single-side cap (honoured exactly), above the 10.56% tie-only cap (clamped).
Promo players bypass the cap; the house may lose on them **by design**.

**Spectator rounds** (player staked nothing): no server call. The client resolves the
round locally with `sampleNaturalDtOutcome(rng)` from the shared module — raw
`DT_NATURAL` odds, uniform consistent cards — purely to keep the table alive
(SkyRise's `genSpectatorCrashMultiplier` precedent).

---

## 6. Server flow — one shot, zero client trust

A dedicated route (multi-zone portfolio doesn't fit `placeBet`'s single-multiplier
shape): **`app/api/games/dragon-tiger/route.ts`** → `playDragonTigerRound()` in
[lib/actions/games.ts](../actions/games.ts).

Unlike SkyRise there is **no settle round-trip and no pending state** — the outcome is
fully determined the moment bets lock, so debit, resolve, and credit happen in ONE
transaction. The client can only animate what the server already settled. (This
deliberately closes the client-trust gap class that SkyRise/Mines still carry.)

```
Client                                   Server
  │  (countdown hits t−1.0s, bets lock)     │
  │── POST /api/games/dragon-tiger ────────▶│ 1. auth · assertGamePlayable("dragon-tiger")
  │   { bets: { dragon?, tiger?, tie? },    │ 2. validate: ints ≥ 0, present zones ≥ 10?*,
  │     clientSeed? }                       │    10 ≤ S ≤ 20000
  │                                         │ 3. getPlayerWinProbability(userId, S)
  │                                         │ 4. effectivePct (qMax cap unless promo)
  │                                         │ 5. resolveDragonTigerWithProbability(...)
  │                                         │ 6. db.transaction:
  │                                         │    wallet FOR UPDATE · balance ≥ S
  │                                         │    payout = R(winner); profit = payout − S
  │                                         │    insert game_rounds (completed) + 1 bets row
  │                                         │    update wallet · insert transaction
  │◀─ { roundId, winner, dragonCard, ───────│
  │     tigerCard, totalStaked, payout,     │
  │     profit, newBalance }                │
  │  [stash → flip cards at countdown 0]    │
```

\* per-zone minimum = smallest chip (10); zones omitted or 0 are simply not bet.

**`game_rounds` snapshot** (reporting contract, same columns as every game):
`game_type "dragon-tiger"` · `outcome = { bets, winner, dragonCard, tigerCard }` ·
`multiplier = payout/S` (4 dp, the portfolio multiple) · `house_edge "0.0500"` ·
`win_probability` (configured) · `effective_win_probability` (post-cap) ·
`expected_rtp = dtExpectedRtp(bets, effectivePct)` · `is_promo` · `is_win_round = win` ·
`status "completed"`. One `bets` row: `choice = { bets }`, `payout`, `profit`.

**Failure handling (client):** POST rejects/errors → toast, refund the *local* balance
display (server never debited), resolve the round visually as a spectator round.

**Early-knowledge note:** the response lands ~1s before the flip completes, so DevTools
could read the winner a few seconds early — that's display-only (betting is already
locked; nothing money-affecting remains client-side). Optionally XOR-mask the winner
like SkyRise's `crashAt` token to deter casual snooping.

---

## 7. Files to create / touch (full wiring checklist)

New:

- `lib/games/dragon-tiger.ts` — constants, `dtReturns`, `dtMaxWinPct`, `dtExpectedRtp`, `sampleNaturalDtOutcome` (client-safe)
- `lib/game-engine.ts` — `resolveDragonTigerWithProbability()`
- `lib/actions/games.ts` — `playDragonTigerRound()`
- `app/api/games/dragon-tiger/route.ts`
- `components/games/dragon-tiger/dragon-tiger-game.tsx` (+ `bots.ts`, `history.tsx`, `chip-rack.tsx`, `bet-zones.tsx`, `trend-modal.tsx` as needed)
- `app/protected/games/dragon-tiger/{page,loading}.tsx` — deep-link stub (`redirect("/?game=dragon-tiger")`) + loading screen

Touch (the confirmed full set from [games-roadmap.md](./games-roadmap.md#wiring-checklist-the-full-set--confirmed-across-all-5-builds)):

- [x] `lib/games-catalogue.ts` — added `"dragon-tiger"` to `GameSlug`, `LIVE_GAMES`
      (title **Dragon vs Tiger**, subtitle *"Pick a side — one card decides"*, emoji 🐯,
      payout `Up to 9×`, gradient indigo→amber, badge NEW), `SLUG_TO_GAME_TYPE`
- [x] `components/games/games-native-wrapper.tsx` — `GameType` union + `GAME_RULES["dragon-tiger"]`
      (**not** `games-wrapper.tsx` — see Implementation notes)
- [x] `components/lobby/game-view.tsx` — `dynamic()` import + `renderGame()` case
- [x] `components/protected/game-card-art.tsx` — `DragonTigerArt` SVG + `CARD_ART` registration
- [x] `components/games/game-loading-screen.tsx` — `GAME_CONFIG["dragon-tiger"]`
      (accent `#f5b60a`; bgImage temporarily reuses the in-game `/games/dragon-tiger/bg-table.png` until a portrait loading PNG lands)
- [x] `app/admin/reports/tabs/games-tab.tsx` — `EXPECTED_HOLD["dragon-tiger"] = 0.05`
- [x] `app/admin/promotions/promotion-actions.tsx` — `LIVE_GAME_OPTIONS` entry
- [x] `/api/games/history` — no change needed (plain-text `game_type`); records modal wired via the native wrapper
- [x] `games` registry table — `scripts/seed-games.mjs` gained the row (additive, safe to re-run) **and** `getAllGames()` now merges catalogue games missing from the table, so the game reaches the lobby even before seeding

---

## 8. Verification checklist (definition of done)

- [x] `tsc` + `eslint` clean; production `next build` passes with the new route + page.
- [x] **Monte-Carlo sim** (`scripts/dragon-tiger-sim.ts`, run with `npx tsx`): 7
      portfolios (incl. tie-only, D+tie, both hedges) × tiers 5/20/35/60/95% × promo
      pass, 60k rounds each against the REAL engine fn. All assertions hold: non-promo
      `EV/S ≤ 0.95` (60/95% tiers clamp to 47.5% single-side / 10.56% tie-only);
      promo tracks the raw pct exactly; hedges produce zero win rounds; every card
      pair consistent with `winner`; observed RTP matches `dtExpectedRtp` within noise.
- [x] Zone totals = bots + player everywhere; rate bar = dragon share of D+T money (implementation).
- [x] Betting locks at t−1.0s; late server response holds a "Dealing…" banner; server
      error refunds the local display and degrades to spectator (implementation).
- [x] No client-influenced money path: one transaction, no pending round, stakes
      validated by `normalizeDtBets`, payout purely server-computed.
- [ ] Manual pass on a phone: tab-hide catch-up, deep link, lobby card, loading
      screen, records modal, admin hold badge — everything compiled + wired, needs an
      eyeball in the running app.

## 9. Defaults chosen (flag-gated where noted)

- Tie takes Dragon/Tiger stakes in full (`DT_TIE_REFUND_HALF = false`).
- Single-deck tie odds (`3/51 ≈ 5.88%`) for natural weighting — the 8-deck variant
  (`≈7.47%`) is a one-line constant change.
- 15s betting / 8s free time; 60-result history; 24–48 bots; chips up to 10,000.
- House edge 5% (portfolio cap) — deliberately close to the game's real-world ~5.9%
  Dragon/Tiger edge so capped behaviour feels natural.

## Implementation notes (decisions made during build)

- **`GamesNativeWrapper`, not `GamesWrapper`.** The spec's checklist said
  `games-wrapper.tsx`, but that wrapper is for the panel-style games. Dragon vs Tiger
  is a full-bleed live table like SkyRise, so the native wrapper got the
  `GameType`/`GAME_RULES` additions instead; `games-wrapper.tsx` is untouched.
- **Registry merge instead of seed-only.** `getAllGames()` previously fell back to the
  catalogue only when the `games` table was *empty*, so a seeded table would have
  silently hidden any newly-shipped game. It now merges catalogue entries whose slug
  is missing from the table (and `scripts/seed-games.mjs` gained the dragon-tiger row
  — additive `ON CONFLICT DO NOTHING`, safe to re-run).
- **`dtExpectedRtp` empty-win-set fix (caught by the sim).** For a hedged book
  (`W = ∅`) the engine forces loss-set outcomes at ANY configured pct — including
  promo — so the snapshot formula uses `q = 0` there. Without it a promo hedge would
  have snapshotted `expected_rtp ≈ 0.38` while realising `≈ 0.94`.
- **Cards use rank 0–12** (A low), matching the shared `PlayingCard` `RANK_LABEL`
  indexing — not the 1–13 written in the spec's rules table. Comparison is identical.
- **Chip-sprite artwork snaps down** to the nearest real denomination (a re-bet drops
  one sprite per zone carrying the zone's total, e.g. 1,400 → renders the 1000 chip).
- **Bespoke SFX wired** (`bg-loop`, `chip-place`, `dragon-roar`, `tiger-roar` from
  `/public/sounds/dragon-tiger/`; tick/flip/win/loss still ride the shared clips).
  The bg loop obeys the `bgMusic` volume setting and retries on first tap
  (autoplay policy). Eight unnamed clips sit in `sounds/dragon-tiger/unknown/` —
  identify and wire (candidates: card flip, countdown tick, win chime, tie gong).
- **Assets ship as WebP** (generated alongside the PNG masters; ~10.5 MB → ~1.75 MB
  for the whole screen). All code paths reference `.webp`; PNGs remain as source.
- **Bets-lock widened to 1.5 s** (spec said 1.0) + the route exposes a warm-up `GET`
  fetched on mount, so the "Dealing…" hold only appears on genuinely slow rounds; the
  round POST carries an 8 s abort → refund → spectator fallback so a hung request can
  never freeze the table.
- **Post-review polish pass** (multi-agent review findings): instant card reset (no
  blank un-flip), winner glow persists the whole result window (GPU-cheap opacity
  pulse), stronger hero lunge, burst fills the clash window, "Stop Betting" lock cue,
  countdown never flashes 0, tab-hidden catch-up settles silently (no confetti over
  the next round), chips fly in from the rack and collect toward the player on
  payout, big wins (≥ PKR 5,000) get a triple confetti burst, zone shake on rejected
  bets, players drawer shows bots' current-round stakes, break-even hedge rounds stay
  neutral (no loss sting), AnimatedNumber glides through rapid changes, rate share is
  render-derived (no double render per bot batch), modals mount only while open, and
  history badges keep stable keys.
- **Loading screen** temporarily reuses the in-game `bg-table.webp` (landscape) —
  replace with the portrait `/brand/loading/dragon-tiger.png` from the assets doc.
- **Sim lives at `scripts/dragon-tiger-sim.ts`** (`npx tsx scripts/dragon-tiger-sim.ts`)
  and tests the real `resolveDragonTigerWithProbability` + shared-module math, not a copy.
