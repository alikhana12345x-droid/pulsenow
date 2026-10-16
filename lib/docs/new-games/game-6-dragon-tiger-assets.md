# Dragon vs Tiger — Asset Production Guide (types, specs & generation prompts)

> Companion to **[game-6-dragon-tiger.md](./game-6-dragon-tiger.md)**. This doc is the
> complete shopping list: every visual/audio asset the clone needs, its exact spec
> (path, size, format), and a **copy-paste generation prompt** for each one.
> General buy-vs-generate guidance lives in the
> [roadmap tooling reference](./games-roadmap.md#asset-tooling-reference).

Unlike the previous five games (pure hand-coded SVG), Dragon vs Tiger is an
**art-heavy live table** — the reference look depends on painted hero creatures, an
ornate arena, and chip/avatar sets. Those are generated with AI image tools; everything
geometric (badges, rate bar, lobby card, chip fallbacks) stays hand-coded SVG.

---

## 1. Tooling & workflow

| Task | Tool | Notes |
|---|---|---|
| Raster art w/ transparency | **ChatGPT image gen (`gpt-image-1`)** | Supports `background: transparent` natively and 1024², 1536×1024, 1024×1536. **First choice for all sprites.** |
| Raster art, alternative | Midjourney v6+ | Better painterly quality; no true transparency → generate on solid `#FF00FF`, then remove. Use `--sref <first accepted image>` to lock the style across assets. |
| Background removal | [remove.bg](https://remove.bg) / `rembg` (local, free) | Only needed for the Midjourney path. |
| Trim + convert | ImageMagick `magick in.png -trim +repage out.png`, then `cwebp -q 80` (or [squoosh.app](https://squoosh.app)) | Ship **.webp**; keep master PNGs in a local `art-src/` folder (not in the repo). |
| Vector assets | Hand-code SVG (existing house style) | Lobby card art, history badges, rate bar, chip fallback set. |
| SFX | **ElevenLabs SFX** (text→sound) or [jsfxr](https://sfxr.me) / Pixabay / Mixkit / freesound.org | Prompts below. Ship mono MP3 ~128 kbps. |
| Music loop | Suno/Udio, or royalty-free (Pixabay Music) | 60–90 s seamless loop. |

**Consistency rule:** generate `dragon-hero` first, get it approved, then generate every
other asset in the *same chat/session* (or with `--sref` in MJ), always prepending the
Master Style Block below. Re-roll until the gold-trim language matches across assets.

### Master Style Block (prepend to every image prompt)

```
STYLE: premium mobile casino game asset, East-Asian fantasy style, ornate carved gold
filigree trim, rich saturated colors, dramatic rim lighting, glossy game-art finish,
high-detail digital painting, clean readable silhouette, centered composition,
no text, no watermark, no logo, not photorealistic.
PALETTE: dragon side = azure blue / ice-white / jade glow; tiger side = ember orange /
molten gold / fire glow; accents = antique gold #f5b60a on deep night-indigo #140f2b.
```

### File conventions

- Images → `public/games/dragon-tiger/` (new dir), lowercase-kebab names, `.webp`.
- Sounds → `public/sounds/dragon-tiger/`, `.mp3`.
- Brand assets follow the shared formats in [game-assets.md](./game-assets.md#two-shared-formats-to-commission-against).

---

## 2. Asset inventory (the complete list)

| # | Asset | Path | Size (px) | Alpha | Priority |
|---|---|---|---|---|---|
| A1 | Arena background | `games/dragon-tiger/bg-table.webp` | 1920×1080 (gen 1536×1024, upscale) | no | **P0** |
| A2 | Dragon hero | `games/dragon-tiger/dragon-hero.webp` | ~1024×1024 trimmed | yes | **P0** |
| A3 | Tiger hero | `games/dragon-tiger/tiger-hero.webp` | ~1024×1024 trimmed | yes | **P0** |
| A4 | VS emblem (idle) | `games/dragon-tiger/vs-emblem.webp` | 512×512 | yes | **P0** |
| A5 | VS clash burst | `games/dragon-tiger/vs-burst.webp` | 1024×1024 | yes | P1 |
| A6 | Card back | `games/dragon-tiger/card-back.webp` | 640×896 (5:7) | yes (rounded corners) | **P0** |
| A7 | Card gold frame overlay | `games/dragon-tiger/card-frame.webp` | 640×896 | yes | P2 (optional) |
| A8 | Dragon zone watermark | `games/dragon-tiger/dragon-mark.webp` | 768×768 | yes | P1 |
| A9 | Tiger zone watermark | `games/dragon-tiger/tiger-mark.webp` | 768×768 | yes | P1 |
| A10 | Chip set ×7 (10…10000) | `games/dragon-tiger/chip-{value}.webp` | 512×512 each | yes | P1 (SVG fallback P0) |
| A11 | Avatar pack ×12 | `games/dragon-tiger/avatar-{01..12}.webp` | 512×512 each | yes | P1 |
| A12 | Crown badge | `games/dragon-tiger/crown.webp` | 256×256 | yes | P1 |
| A13 | Gold coin icon | `games/dragon-tiger/coin.webp` | 256×256 | yes | P1 |
| A14 | Coin-rain celebration | Lottie JSON or sprite sheet | — | — | P2 |
| A15 | Loading screen | `brand/loading/dragon-tiger.png` | 1080×1920 | no | P1 |
| A16 | Promo banner | `brand/promotions/games/dragon-tiger.png` | 1200×400 (3:1) | no | P2 |
| A17 | Lobby card art `DragonTigerArt` | hand-coded SVG in `game-card-art.tsx` | — | — | **P0** |
| A18 | History badges / rate bar / phase banner | hand-coded SVG/CSS | — | — | **P0** |

P0 = required to ship · P1 = ship-week polish · P2 = later. The game is playable with
P0 only (CSS-gradient stand-ins for A1/A5/A8/A9, SVG chips for A10, initial-letter
avatars for A11 — same graceful-fallback stance as the other five games).

---

## 3. Image prompts (copy-paste, one per asset)

### A1 — Arena background `bg-table.webp`

Generate at 1536×1024 (landscape), upscale ×1.5, no transparency.

```
[Master Style Block]
A wide mobile-game arena background for a casino card table, viewed straight-on.
An ancient Chinese temple courtyard at night: carved stone pillars and glowing red
paper lanterns on both sides, distant pagoda rooftops in mist. The LEFT half is lit
in cold azure-blue moonlight with drifting jade mist; the RIGHT half is lit in warm
ember-orange firelight with floating embers; the two halves blend at the center.
The lower two-thirds is intentionally dark, low-contrast and empty — a UI panel will
cover it. No creatures, no cards, no UI, no text. Cinematic, atmospheric depth.
```

Post: upscale to 1920×1080 → darken bottom 60% a touch more (UI legibility) → `cwebp -q 78` (budget ≤ 350 KB).

### A2 — Dragon hero `dragon-hero.webp` (transparent)

```
[Master Style Block]
A majestic Chinese dragon game character on a fully transparent background.
Long serpentine body in azure blue and ice-white scales with a jade-green mane,
flowing whiskers, glowing cyan eyes, small arcs of blue lightning and frost mist
around it. Pose: coiled S-curve, head high, FACING RIGHT, mouth open mid-roar,
claws forward as if charging into battle. Entire creature fits in frame with clean
edges, slight white-blue rim light. Painterly casino-game splash-art quality.
```

Post: `-trim`, keep ~24 px padding, ≤ 250 KB. **This image sets the style — approve it first, then generate everything else against it.**

### A3 — Tiger hero `tiger-hero.webp` (transparent)

```
[Master Style Block]
A ferocious mystical tiger game character on a fully transparent background,
SAME art style, scale and lighting treatment as the approved dragon asset.
Muscular golden-orange tiger with black stripes and white chest, mane of living
flame along its spine and tail, glowing amber eyes, sparks and embers trailing.
Pose: mid-leap pounce, FACING LEFT, jaws open in a roar, front claws extended.
Clean silhouette, warm gold rim light, painterly splash-art quality.
```

### A4 — VS emblem `vs-emblem.webp` (transparent)

```
[Master Style Block]
A compact "VS" versus emblem for a fighting card game, transparent background.
Two bold interlocking letters V and S in polished antique gold with carved dragon
motifs, wrapped in a small ring of blue flame on the left half and orange flame on
the right half. Symmetrical, reads clearly at 64 px. Subtle metallic bevel and glow.
```

(Letterforms are allowed here — it's an emblem, not UI text. If the generator mangles
them, fall back to hand-set "VS" in a display font over a generated flame-ring version
of this prompt with "no letters".)

### A5 — VS clash burst `vs-burst.webp` (transparent)

```
[Master Style Block]
A radial impact burst effect sprite, transparent background: colliding shockwave of
blue frost energy from the left and orange fire from the right, meeting in a bright
white-gold flash at the center with radiating light rays, sparks and embers.
No creatures, no letters — pure VFX overlay sprite, edges fade fully to transparent.
```

Shown scaled ~1.6× behind the flip slots for ~300 ms at clash (§3 timing in the spec).

### A6 — Card back `card-back.webp`

```
[Master Style Block]
A playing-card BACK design, portrait 5:7 ratio, full-bleed. Deep crimson-red field
with an intricate symmetrical antique-gold filigree pattern; at the center a circular
gold medallion showing a dragon and a tiger curled head-to-tail around a yin-yang
motif. Thin double gold border inset from the edge. Flat design, crisp details that
survive at 90 px tall. No letters, no numbers.
```

Post: round the corners to radius ≈ 5% of width (match `PlayingCard`'s radius), export with alpha.
Card **faces** are NOT assets — they're the programmatic
[`PlayingCard`](../../components/games/_shared/playing-card.tsx), optionally framed by A7.

### A7 — Card gold frame overlay `card-frame.webp` (optional)

```
[Master Style Block]
An ornate thin antique-gold decorative FRAME border for a playing card, portrait 5:7,
transparent background and fully transparent interior — only the border itself, with
delicate filigree corners. Clean, symmetric, reads at small sizes.
```

### A8 / A9 — Zone watermarks `dragon-mark.webp` / `tiger-mark.webp`

One prompt, run twice with the bracketed swaps:

```
[Master Style Block]
A ghosted emblem watermark for a betting panel, transparent background: the head and
front claws of a [Chinese azure dragon / flame-maned golden tiger], drawn as a soft
monochromatic [ice-blue / amber-gold] semi-transparent glow, like frosted glass art.
Very low contrast, no hard edges, meant to sit at 20% opacity behind UI text.
```

Rendered at ~55% zone width, bottom-anchored (see screenshot state A).

### A10 — Chip set `chip-{10,50,100,500,1000,5000,10000}.webp`

Template — run once per value; keep the same session so the mold matches:

```
[Master Style Block]
A single glossy casino chip, straight top-down view, transparent background.
[COLOR] core with a white dashed edge ring and [COLOR-dark] outer rim, gold pinstripe
details, subtle plastic sheen. Large clear number "[VALUE]" embossed in white at the
center with a small gold "CHIP" banner beneath it. Reads perfectly at 56 px.
```

| Value | COLOR |
|---|---|
| 10 | emerald green |
| 50 | royal blue |
| 100 | violet purple |
| 500 | crimson red-orange |
| 1000 | amber gold |
| 5000 | teal |
| 10000 | black & gold |

**SVG fallback (P0):** hand-code a `<Chip value color>` component (circle + dashed ring
+ number) so the game ships before/without the rendered set — swap to images when approved.
If the generator fumbles digits, generate the blank chip (no number) and overlay the
value as HTML text — that's also how the selected-chip glow stays crisp.

### A11 — Avatar pack `avatar-{01..12}.webp`

Template ×12 — vary PERSON each run; same style block, same session:

```
[Master Style Block]
A circular mobile-game avatar portrait, bust only, transparent background outside the
circle. Stylized friendly 3D-cartoon character: [PERSON]. Warm studio lighting, slight
smile, looking at camera, ornate thin gold ring border around the circular crop.
```

PERSON list (mirrors the reference's mix): `young South-Asian man with beard and pompadour` ·
`older man with grey moustache and glasses` · `young woman with dupatta and jhumka earrings` ·
`cheerful heavyset man with gold chain` · `young man with spiked hair and hoodie` ·
`middle-aged woman with bindi and bun` · `clean-shaven man in sherwani collar` ·
`young woman with ponytail and headset` · `man with turban and full beard` ·
`grinning man with sunglasses` · `young man with curly hair` · `woman with hijab and soft smile`.

### A12 — Crown badge `crown.webp`

```
[Master Style Block]
A small regal golden crown icon, three-pointed with ruby-red gem inlays, slight 3/4
tilt, glossy metallic shine, transparent background, reads clearly at 28 px.
```

### A13 — Gold coin icon `coin.webp`

```
[Master Style Block]
A single shiny gold coin icon, straight-on, embossed star at the center, crisp rim
detail, subtle specular highlight, transparent background, reads clearly at 20 px.
```

### A15 — Loading screen `brand/loading/dragon-tiger.png` (1080×1920 portrait)

Per the shared loading-image format (dark, uncluttered top & bottom thirds — brand mark
overlays the top, title/tagline/progress overlay the bottom):

```
[Master Style Block]
A PORTRAIT 9:16 mobile loading screen illustration. In the vertical center, a Chinese
azure dragon (upper-left, diving down) and a flame-gold tiger (lower-right, leaping up)
spiral toward each other around two glowing face-down playing cards, blue frost energy
meeting orange fire in a gold flash between them. Night temple backdrop with lanterns,
heavily darkened. CRITICAL: top 25% and bottom 30% of the canvas are near-black,
low-contrast empty atmosphere — UI text will overlay there. No text anywhere.
```

Accent to pass to `GAME_CONFIG`: `#f5b60a`.

### A16 — Promo banner `brand/promotions/games/dragon-tiger.png` (1200×400, 3:1)

```
[Master Style Block]
A WIDE 3:1 casino promo banner. RIGHT two-thirds: the azure dragon and flame tiger
lunging at each other over a fanned pair of playing cards and scattered gold casino
chips, blue-vs-orange energy clash, gold sparks. LEFT third: near-black empty gradient
for headline text overlay. High drama, no text.
```

### A17 — Lobby card art `DragonTigerArt` (hand-coded SVG — no prompt)

Follow the house pattern in `components/protected/game-card-art.tsx`: diagonal split
background (indigo `#1e1b4b` → amber `#78350f`), two mini card-backs tilted ±12° at
center with a gold `VS` roundel, a blue `D` hex badge left and gold `T` hex badge
right, tiny green `Tie` pill beneath. Optional: generate a raster concept with the A16
prompt and eyeball-trace the composition — but ship the SVG.

### A18 — History badges, rate bar, phase banner (hand-coded — no prompt)

Pure SVG/CSS per the spec §4.3–4.4: blue/gold hexagons (`clip-path` or SVG polygon),
green `Tie` pill, red corner sash on the newest badge, gold-trimmed banner pill
(`Start Betting N` / `Free Time N`), star + D↔T slider. No images.

---

## 4. SFX & music (`public/sounds/dragon-tiger/`)

Placeholders on day one: reuse shared `win.mp3` / `loss.mp3` / `button-click.mp3` (the
established pattern). Then replace with the set below — generate with **ElevenLabs SFX**
using the prompt text, or pull an equivalent from Pixabay/Mixkit/freesound (search terms
in parentheses). Keep each ≤ 3 s except the loop; normalise to −14 LUFS-ish; mono MP3.

| File | ElevenLabs prompt (search fallback) | Trigger |
|---|---|---|
| `bg-loop.mp3` | "Seamless 75-second loop, mysterious Chinese casino lounge music, guzheng and erhu over a soft modern beat, tense but elegant, loopable" (*"chinese traditional loop"*) | game mount, loop (SkyRise bg pattern) |
| `chip-place.mp3` | "Single casino chip landing on felt with a soft clack" (*"poker chip single"*) | every chip placement (player + bots, throttled) |
| `countdown-tick.mp3` | "Short wooden percussion tick, urgent" (*"clock tick short"*) | each of the last 5 betting seconds |
| `bets-locked.mp3` | "Quick metallic gate-latch snap" (*"lock click"*) | betting → reveal transition |
| `card-flip.mp3` | "Crisp playing-card flip snap" (*"card flip"*) | each of the two flips |
| `clash.mp3` | "Cinematic impact hit with Chinese cymbal crash and a fire whoosh" (*"cinematic impact cymbal"*) | VS burst moment |
| `dragon-win.mp3` | "Deep echoing dragon roar with an icy shimmer tail" (*"dragon roar"*) | Dragon result |
| `tiger-win.mp3` | "Aggressive big-cat tiger roar with a fiery crackle tail" (*"tiger roar"*) | Tiger result |
| `tie.mp3` | "Single resonant Chinese gong hit" (*"gong"*) | Tie result |
| `win-chime.mp3` | "Bright ascending casino jackpot chime, short" (*"win chime"*) | player net-positive settle |
| `coin-shower.mp3` | "Cascade of many gold coins pouring onto a pile, 2 seconds" (*"coins falling"*) | big-win coin rain (≥ PKR 5,000) |

A14 (coin-rain visual): grab a free **LottieFiles** "gold coins falling" animation
(fits the existing Lottie note in the roadmap) or reuse `fireWinConfetti()` from
[lib/confetti.ts](../confetti.ts) with gold-only colors as the P0 stand-in.

---

## 5. Acceptance checklist (art QA)

- [ ] Style consistency: dragon/tiger/emblem/chips read as ONE game (shared gold trim + palettes); heroes at equal visual weight and scale.
- [ ] Every alpha asset: fully transparent edges (no matte halo — check on white AND black), trimmed, ≤ padding 24 px.
- [ ] Legibility floor honoured: chips at 56 px, crown at 28 px, coin at 20 px, card back at 90 px tall, VS at 64 px.
- [ ] No baked-in text anywhere except the VS emblem and chip numerals (and those only if they generated cleanly).
- [ ] Budgets: bg ≤ 350 KB, heroes ≤ 250 KB, burst ≤ 200 KB, chips ≤ 30 KB, avatars ≤ 40 KB, loading PNG ≤ 500 KB, total dir ≤ 2.5 MB.
- [ ] Loading image: top 25% / bottom 30% stay uncluttered under the real overlay (test in `game-loading-screen.tsx`).
- [ ] Promo banner: headline legible over the left third at 50% viewport width.
- [ ] SFX: no clipping, loop point seamless on `bg-loop.mp3`, all volumes respect `getSoundSettings()` scaling.
- [ ] Licences recorded for anything pulled from free libraries (source URL + licence in this doc's margin notes).
