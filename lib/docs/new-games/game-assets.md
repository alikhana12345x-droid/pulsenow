# BetPulse — New Games: Asset Inventory & Follow-ups

> Companion to [games-roadmap.md](./games-roadmap.md). Covers the five new games
> (Limbo, Dragon Tower, Andar Bahar, Plinko, Keno).
>
> **TL;DR:** every game shipped **fully playable on in-house, generated assets** —
> all lobby card art and all in-game visuals are hand-coded SVG/CSS, and sounds
> reuse the shared win/loss/click clips. What remains is **cosmetic polish**: a
> dedicated loading image, a promo banner, and bespoke SFX per game. None of it
> blocks play. See the [asset tooling reference](./games-roadmap.md#asset-tooling-reference) for the buy-vs-generate guide.

Legend: ✅ done (in-house) · 🟡 placeholder in place (works, but reuses another game's asset) · ⬜ not started (optional polish).

---

## Shared assets (reused by all five)

| Asset | Status | Location / code ref |
|---|---|---|
| Win / loss SFX | ✅ | `/public/sounds/win.mp3`, `/public/sounds/loss.mp3` (each game loads these) |
| Button / tick SFX | ✅ | `/public/sounds/button-click.mp3` via `playClick()` (`lib/sound.ts`) |
| Win confetti | ✅ | `lib/confetti.ts` (`fireWinConfetti()`) |
| Haptics | ✅ | `lib/haptics.ts` (`hapticTap/Win/Loss`) |
| Lobby card art (per game) | ✅ | hand-coded SVG in `components/protected/game-card-art.tsx`, registered in `components/lobby/lobby-grid.tsx` |

### Two shared formats to commission against

- **Loading image** — portrait, full-bleed **WebP** (rendered `object-cover object-center`, full screen). Match the existing `/public/brand/loading/dice-roll.webp` etc. Generate at **1080×1920** (or 1024×1536 from `gpt-image-1`), dark / low-contrast (a brand mark overlays the top and the game name + tagline + progress bar overlay the bottom — keep those zones uncluttered; keep the subject inside the central 70% of the width, since `object-cover` crops the sides on 9:16 phones). Drop the master PNG into `public/brand/loading/` and run `node scripts/optimize-loading-art.mjs --convert --cleanup` to kebab-case the name and re-encode to WebP q80. Wired in `components/games/game-loading-screen.tsx` → `GAME_CONFIG[<slug>].bgImage`.
- **Promo banner** — **3:1** PNG, art on the right, left side dark for text overlay. Match `/public/brand/promotions/games/dice-roll.png`. Recommended **1200×400**. Wired in `app/admin/promotions/promotion-actions.tsx` → `IMGS.game_<slug>` + a `TEMPLATES` entry.

> Each game's loading config already has an on-brand **accent colour** chosen — reuse it when art-directing so the loading screen, lobby card, and in-game palette stay consistent.

---

## Per-game inventory

### 1. Limbo — accent `#22d3ee` (cyan)

| Asset | Status | Detail |
|---|---|---|
| Lobby card art (`LimboArt`) | ✅ | Rising multiplier curve + `×` readout, hand-coded SVG |
| In-game visuals | ✅ | Count-up multiplier readout + rising-trajectory SVG + dot-grid bg (pure CSS/SVG) |
| Outcome SFX | ✅ | win.mp3 / loss.mp3 + `playClick` on roll |
| Loading image | ✅ | `/brand/loading/limbo.webp` (941×1672, 105 KB) |
| Promo banner | ⬜ | TODO `/brand/promotions/games/limbo.png` (3:1) + `IMGS.game_limbo` + template |
| Bespoke SFX | ⬜ | optional: rising "whoosh" on roll, soft tick as the number climbs, ambient bg loop |

### 2. Dragon Tower — accent `#f97316` (orange)

| Asset | Status | Detail |
|---|---|---|
| Lobby card art (`DragonTowerArt`) | ✅ | Tower of tiles + glowing egg + flame, hand-coded SVG |
| In-game visuals | ✅ | `EggGlyph` + `DragonGlyph` inline SVG, tile states in CSS |
| Outcome SFX | ✅ | win.mp3 / loss.mp3 + `playClick` per tile pick |
| Loading image | ✅ | `/brand/loading/dragon-tower.webp` (941×1672, 76 KB) |
| Promo banner | ⬜ | TODO `/brand/promotions/games/dragon-tower.png` (3:1) + `IMGS` + template |
| Bespoke SFX | ⬜ | optional: egg "reveal" pop, rising climb ping, **dragon roar** on loss, cashout chime, bg loop |
| Premium icon pack (optional) | ⬜ | a matched egg + dragon + flame set (Flaticon/Envato) would sharpen the theme; Iconify covers a free path |

### 3. Andar Bahar — accent `#10b981` (emerald)

| Asset | Status | Detail |
|---|---|---|
| Lobby card art (`AndarBaharArt`) | ✅ | Centre joker + two fanned piles, hand-coded SVG |
| Card faces (all 52) | ✅ | **Rendered programmatically** — shared `components/games/_shared/playing-card.tsx` (`PlayingCard`) + a compact `MiniCard`. **Zero card images.** |
| Table / felt | ✅ | CSS gradient felt + labelled Andar / Bahar lanes |
| Outcome SFX | ✅ | win.mp3 / loss.mp3 + `playClick` per dealt card |
| Loading image | ✅ | `/brand/loading/andar-bahar.webp` (941×1672, 78 KB) |
| Promo banner | ⬜ | TODO `/brand/promotions/games/andar-bahar.png` (3:1) + `IMGS` + template |
| Bespoke SFX | ⬜ | optional: dedicated card-deal "flick" (looped per card), bg loop |
| Premium felt/chips (optional) | ⬜ | a felt texture + chip pack (Envato/Kenney) for a richer table feel |

### 4. Plinko — accent `#a78bfa` (violet)

| Asset | Status | Detail |
|---|---|---|
| Lobby card art (`PlinkoArt`) | ✅ | Peg triangle + ball + coloured buckets, hand-coded SVG |
| In-game visuals | ✅ | Peg field (SVG circles), ball, multiplier buckets (`plinko-board.tsx`) — all generated |
| Drop animation | ✅ | Deterministic ball animation snapping to the server path |
| Outcome SFX | ✅ | win.mp3 / loss.mp3 on land + `playClick` on drop |
| Loading image | ✅ | `/brand/loading/plinko.webp` (941×1672, 39 KB) |
| Promo banner | ⬜ | TODO `/brand/promotions/games/plinko.png` (3:1) + `IMGS` + template |
| Bespoke SFX | ⬜ | optional but high-impact: **per-peg tick** on each bounce, bucket-land chime, bg loop (wire ticks into `plinko-board.tsx` per animation step) |
| Lottie ball-drop (optional) | ⬜ | a premium LottieFiles coin/ball burst would elevate the drop |

### 5. Keno — accent `#6366f1` (indigo)

| Asset | Status | Detail |
|---|---|---|
| Lobby card art (`KenoArt`) | ✅ | Number grid + lottery balls, hand-coded SVG |
| In-game visuals | ✅ | 40-cell CSS grid (idle/picked/hit/miss states), drawn-ball highlighting, live paytable panel |
| Outcome SFX | ✅ | win.mp3 / loss.mp3 + `playClick` per drawn ball (acts as the draw tick) |
| Loading image | ✅ | `/brand/loading/keno.webp` (941×1672, 68 KB) |
| Promo banner | ⬜ | TODO `/brand/promotions/games/keno.png` (3:1) + `IMGS` + template |
| Bespoke SFX | ⬜ | optional: dedicated ball-draw "pop", match "ping" on a hit, bg loop |

---

## Prioritised follow-up list

Nothing here blocks play — ordered by player/marketing visibility.

**P1 — Loading images. ✅ Done.** All eleven games now have dedicated art: `/brand/loading/{limbo,dragon-tower,andar-bahar,plinko,keno}.webp` were generated and the `bgImage` placeholders are gone from `game-loading-screen.tsx`. The whole set was re-encoded PNG → WebP q80 in the same pass (31.9 MB → 886 KB) and the five unreferenced `*-portrait.svg` files were deleted — see `scripts/optimize-loading-art.mjs`.

**P2 — Promo banners + templates (marketing).** The admin promo **CTA dropdown** already lists all five games, but there's no banner art or starter template for them. Per game: add `/brand/promotions/games/<slug>.png` (3:1), an `IMGS.game_<slug>` entry, and a `TEMPLATES` entry in `app/admin/promotions/promotion-actions.tsx`.

**P3 — Bespoke SFX (feel).** All games are audibly functional (win/loss + clicks). Highest-impact additions: Plinko per-peg ticks, Dragon Tower dragon-roar, Andar Bahar card-flick. Generate with jsfxr/Bfxr or grab royalty-free (Pixabay/Mixkit), drop into `/public/sounds/<slug>/`, wire via the `lib/sound.ts` / per-game `<audio>` pattern.

**P4 — Optional premium.** Lottie ball-drop (Plinko), felt/chip pack (Andar Bahar), dragon icon pack (Dragon Tower).

> **Cost to ship as-is: 0.** Every item above is polish. The generated/in-house path (see the [tooling reference](./games-roadmap.md#asset-tooling-reference)) covers all of P1–P3 with no purchases.
