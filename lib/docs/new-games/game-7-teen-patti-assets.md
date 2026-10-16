# Game 7 — Teen Patti 20-20 · Asset Production Guide

> Every visual/audio asset the game needs, its exact spec (path, size, format), and a
> **complete, self-contained generation prompt** for each one.
>
> **Every prompt below is standalone.** Nothing to prepend, no shared "style block" to
> paste in first — copy one prompt, paste it into ChatGPT / Midjourney, done. The style
> language is repeated in full inside each prompt on purpose, so they can be generated in
> any order, in separate chats, on different days.

---

## 1. Art direction (context only — already baked into every prompt)

Dragon vs Tiger is an **East-Asian arena** (azure dragon, ember tiger, gold on night-indigo).
Teen Patti must not look like a recolour of it. Its identity is a **Mughal / Rajasthani royal
card club**: deep emerald and maroon velvet, antique gold jaali lattice and paisley filigree,
brass oil lamps, marble inlay. The two sides are a **peacock** (Player A) and an **elephant**
(Player B) — both unmistakably Indian-royal, neither colliding with the dragon/tiger pair.

Palette used throughout:

| Role | Hex |
|---|---|
| Emerald velvet (table) | `#0d3b2e` → `#07241c` |
| Royal maroon | `#4a0f1e` |
| Antique gold | `#d4a02c` · highlight `#f0c75e` |
| Ivory marble | `#f3e8d2` |
| Player A — sapphire / silver | `#1b3a8f` / `#cfd8e8` |
| Player B — crimson / gold | `#a81f3a` / `#e0a92c` |

---

## 2. Tooling & workflow

| Task | Tool | Notes |
|---|---|---|
| Raster art with transparency | **ChatGPT image gen (`gpt-image-1`)** | Native transparent background. Sizes: 1024×1024, 1536×1024, 1024×1536. **First choice for every sprite below.** |
| Raster art, alternative | Midjourney v6+ | Better painterly quality, no true transparency — generate on solid `#FF00FF`, then key it out. |
| Background removal | [remove.bg](https://remove.bg) or `rembg` (local, free) | Only for the Midjourney path. |
| Trim + convert | ImageMagick, then `cwebp` | Commands in §3. |
| Vector assets | Hand-code SVG | Lobby card art (B7) — spec in §6. |
| SFX | **ElevenLabs SFX** (text→sound), [jsfxr](https://sfxr.me), [Pixabay](https://pixabay.com/sound-effects/) | Prompts in §7. |
| Music loop | Suno / Udio, or royalty-free | 60–90 s seamless loop. |

---

## 3. File conventions & post-processing

- Images → `public/games/teen-patti/`, lowercase-kebab names, **`.webp`**
- Sounds → `public/sounds/teen-patti/`, **`.mp3`** mono ~128 kbps
- Keep master PNGs in a local `art-src/` folder — **not** committed

**Use the script — it does all of it.** `scripts/optimize-teen-patti-art.mjs` moves the
misfiled assets into the brand folders, downscales, re-encodes to WebP, and reports
dimensions + alpha coverage. No ImageMagick or `cwebp` needed (it runs on `sharp`, already
a dependency).

```bash
node scripts/optimize-teen-patti-art.mjs            # report only
node scripts/optimize-teen-patti-art.mjs --convert  # write targets, keep sources
```

Drop new/re-rolled PNGs into `public/games/teen-patti/` under the source names in the
script's `TARGETS` map, re-run `--convert`, then move the masters to `art-src/teen-patti/`
(gitignored). **Never commit the PNG masters** — they're ~2 MB each and the shipped WebP is
5–20× smaller.

> `--cleanup` deletes the source PNGs outright. Prefer moving them to `art-src/` instead.

---

## 4. Asset inventory

Shipped sizes are what's **on disk now** (first generation pass, 2026-09-05). "Ship at" is
the source's own resolution wherever the generator already landed on-spec — the script never
upscales, since that only fabricates detail and bytes.

| # | Asset | Path | Ship at | Size | Alpha | Priority | Status |
|---|---|---|---|---|---|---|---|
| B1 | Table background | `games/teen-patti/bg-table.webp` | 1145×1374 | 177 KB | no | **P0** | ✅ |
| B2a | Rank badge — Trail | `games/teen-patti/rank-trail.webp` | 512² | 102 KB | yes | **P0** | ✅ |
| B2b | Rank badge — Pure Sequence | `games/teen-patti/rank-pure-seq.webp` | 512² | 105 KB | yes | **P0** | ✅ |
| B2c | Rank badge — Sequence | `games/teen-patti/rank-seq.webp` | 512² | 82 KB | yes | **P0** | ✅ |
| B2d | Rank badge — Colour | `games/teen-patti/rank-colour.webp` | 512² | 85 KB | yes | **P0** | ✅ |
| B2e | Rank badge — Pair | `games/teen-patti/rank-pair.webp` | 512×486 | 57 KB | yes | **P0** | ✅ |
| B2f | Rank badge — High Card | `games/teen-patti/rank-high.webp` | 512×488 | 58 KB | yes | **P0** | ✅ |
| B3 | Player A crest (peacock) | `games/teen-patti/crest-a.webp` | 768² | 198 KB | yes | P1 | ✅ |
| B4 | Player B crest (elephant) | `games/teen-patti/crest-b.webp` | 768² | 153 KB | yes | P1 | ✅ |
| B5 | Card back | `games/teen-patti/card-back.webp` | 640×896 | 161 KB | yes | P1 | ✅ |
| B6 | Winner burst | `games/teen-patti/win-burst.webp` | 1024² | 422 KB | yes | P1 | ✅ |
| B7 | Lobby card art `TeenPattiArt` | coded (composites B3/B4/B2a) | — | — | — | **P0** | ✅ |
| B8 | Loading screen | `brand/loading/teen-patti.webp` | 948×1659 | 124 KB | no | P1 | ✅ |
| B9 | Promo banner | `brand/promotions/games/teen-patti.png` | 2172×724 | 2038 KB | no | P2 | ✅ |

Badges ship at **512²**, not the 256² first specced — they're a hero reveal element and 256
softens on 3× DPR phones. WebP keeps them under 105 KB each anyway.

**P0 = required to ship.** The only P0 still open is B7, the hand-coded lobby SVG.

### Deviations accepted from the first pass

- **B1 came out portrait** (1145×1374) where the prompt asked for landscape, so it doesn't
  match `dragon-tiger/bg-table.webp` (1536×1024). Kept — the game is portrait-mobile and
  `object-cover` handles it, with *more* vertical coverage than a landscape plate. Re-roll
  with the B1 prompt only if the fork from the DT component fights it.
- **B4 is more gold-dominant than B3.** The pair balances in structure (same shield, same
  crown, same silhouette envelope), but gold is also the shared UI accent, so crest-b may
  read as louder behind its bet zone. Tune with per-side opacity in CSS before re-rolling.
- **B9 is 2172×724**, not the 1200×400 originally specced — that's exactly
  `dragon-tiger.png`'s size, so it matches the folder. Copied verbatim: re-encoding through
  sharp made it *larger* (2038 KB → 2618 KB).

**B2 is the most important set on this list.** No other game on the platform names its
outcome; Teen Patti's reveal beat is "**PURE SEQUENCE**" flashing over the winning hand, and
these six badges carry it.

---

## 5. Image prompts

Each prompt is complete. Copy one, paste it, generate.

### B1 — Table background · `bg-table.webp`

Generate **1536×1024** (landscape), opaque, then upscale ×1.25 to 1920×1080.

```
A premium mobile casino game background: an opulent Mughal-era Indian royal card room,
viewed straight-on and symmetrically. A rich deep-emerald velvet card table fills the
lower two-thirds, its surface shading from #0d3b2e at the edges to #07241c in the
centre, with an antique gold #d4a02c filigree border of interlocking paisley motifs
running around the rim. Behind the table: carved white marble arches with gold jaali
lattice screens, warm brass oil lamps glowing on both sides, deep maroon #4a0f1e velvet
drapes with gold tassels. Soft warm rim lighting from the lamps, a gentle vignette
darkening all four corners, and a clean uncluttered space in the exact centre of the
table where game elements will be composited. Rich saturated colours, dramatic warm
lighting, glossy high-detail digital painting, premium mobile game art finish,
not photorealistic. No text, no letters, no numbers, no watermark, no logo,
no playing cards, no chips, no people, no hands.
```

### B2a — Rank badge · Trail · `rank-trail.webp`

Generate **1024×1024**, **transparent background**. Highest rank — the most ornate of the six.

```
A single ornate circular game badge medallion on a fully transparent background,
centered, viewed straight-on. An antique gold #d4a02c medallion ring with detailed
Mughal paisley filigree engraving and a beaded outer edge. Inside the ring, three
identical faceted ruby-red gemstones arranged in a tight triangle, glowing with
intense inner red light and casting a warm crimson glow onto the gold. A small royal
crown sits at the top of the ring. Radiant golden light rays emanate softly behind the
medallion. This is the highest-tier badge in a set of six, so it is the most elaborate
and most brilliant. Glossy premium mobile game art, high-detail digital painting,
dramatic rim lighting, clean readable silhouette, rich saturated colours,
not photorealistic. Transparent background, no background elements, no text,
no letters, no numbers, no watermark, no logo.
```

### B2b — Rank badge · Pure Sequence · `rank-pure-seq.webp`

Generate **1024×1024**, **transparent background**.

```
A single ornate circular game badge medallion on a fully transparent background,
centered, viewed straight-on. An antique gold #d4a02c medallion ring with detailed
Mughal paisley filigree engraving and a beaded outer edge. Inside the ring, three
faceted amethyst purple gemstones arranged in an ascending diagonal row, linked by a
glowing violet energy ribbon that flows through all three, with small violet flames
licking upward from the topmost gem. Radiant purple-gold light glows softly behind the
medallion. This is the second-highest badge in a set of six, so it is elaborate and
brilliant but slightly less ornate than the top tier. Glossy premium mobile game art,
high-detail digital painting, dramatic rim lighting, clean readable silhouette,
rich saturated colours, not photorealistic. Transparent background, no background
elements, no text, no letters, no numbers, no watermark, no logo.
```

### B2c — Rank badge · Sequence · `rank-seq.webp`

Generate **1024×1024**, **transparent background**.

```
A single ornate circular game badge medallion on a fully transparent background,
centered, viewed straight-on. An antique gold #d4a02c medallion ring with Mughal
paisley filigree engraving and a beaded outer edge. Inside the ring, three faceted
sapphire blue gemstones arranged as three ascending stair steps rising left to right,
each glowing with cool blue inner light, connected by a thin gold chain. Soft blue-gold
light glows behind the medallion. This is a mid-tier badge in a set of six, so it is
handsome but noticeably simpler than the top tiers. Glossy premium mobile game art,
high-detail digital painting, dramatic rim lighting, clean readable silhouette,
rich saturated colours, not photorealistic. Transparent background, no background
elements, no text, no letters, no numbers, no watermark, no logo.
```

### B2d — Rank badge · Colour · `rank-colour.webp`

Generate **1024×1024**, **transparent background**.

```
A single ornate circular game badge medallion on a fully transparent background,
centered, viewed straight-on. An antique gold #d4a02c medallion ring with Mughal
paisley filigree engraving and a beaded outer edge. Inside the ring, three faceted
emerald green gemstones fanned out side by side like a spread hand, all three exactly
the same green shade to signify matching colour, glowing with soft green inner light.
A subtle emerald aura glows behind the medallion. This is a mid-tier badge in a set of
six, so it is handsome but simpler than the top tiers. Glossy premium mobile game art,
high-detail digital painting, dramatic rim lighting, clean readable silhouette,
rich saturated colours, not photorealistic. Transparent background, no background
elements, no text, no letters, no numbers, no watermark, no logo.
```

### B2e — Rank badge · Pair · `rank-pair.webp`

Generate **1024×1024**, **transparent background**.

```
A single circular game badge medallion on a fully transparent background, centered,
viewed straight-on. A warm gold #d4a02c medallion ring with a simple engraved rope
border, noticeably plainer than an ornate filigree design. Inside the ring, two
identical faceted golden-amber gemstones sitting side by side as a matched pair, with a
gentle warm glow. Only a faint soft light behind the medallion. This is a low-tier
badge in a set of six, so it must look modest and restrained next to the elaborate
higher tiers. Glossy premium mobile game art, high-detail digital painting, soft rim
lighting, clean readable silhouette, not photorealistic. Transparent background,
no background elements, no text, no letters, no numbers, no watermark, no logo.
```

### B2f — Rank badge · High Card · `rank-high.webp`

Generate **1024×1024**, **transparent background**. Lowest rank — deliberately plain.

```
A single circular game badge medallion on a fully transparent background, centered,
viewed straight-on. A muted antique silver and dark bronze medallion ring with a plain
engraved edge and no filigree, looking worn and understated. Inside the ring, one small
pale colourless crystal gemstone with a faint cool shimmer. No glow, no light rays
behind the medallion. This is the lowest-tier badge in a set of six, so it must read as
clearly humbler and less valuable than every other badge in the set. Glossy premium
mobile game art, high-detail digital painting, soft flat lighting, clean readable
silhouette, muted desaturated colours, not photorealistic. Transparent background,
no background elements, no text, no letters, no numbers, no watermark, no logo.
```

### B3 — Player A crest · peacock · `crest-a.webp`

Generate **1024×1024**, **transparent background**. Used as a large low-opacity watermark
behind the Player A bet zone.

```
An ornate heraldic crest emblem on a fully transparent background, centered, viewed
straight-on and symmetrically. A majestic Indian peacock with its tail fanned wide
behind it, rendered in deep sapphire blue #1b3a8f and bright polished silver #cfd8e8,
with iridescent blue-green eye patterns on the fanned tail feathers. The bird stands on
an antique gold #d4a02c heraldic shield base decorated with Mughal paisley filigree
engraving, and a small silver royal crown sits above its head. Cool blue rim lighting
from behind, silver metallic highlights on the feather edges. The silhouette must be
bold and instantly readable at small size and at low opacity. Glossy premium mobile
game art, high-detail digital painting, rich saturated colours, not photorealistic.
Transparent background, no background elements, no text, no letters, no numbers,
no watermark, no logo.
```

### B4 — Player B crest · elephant · `crest-b.webp`

Generate **1024×1024**, **transparent background**. Watermark behind the Player B bet zone —
must mirror B3 in weight and framing.

```
An ornate heraldic crest emblem on a fully transparent background, centered, viewed
straight-on and symmetrically. A powerful decorated Indian royal elephant facing
forward with its trunk raised, draped in a rich crimson #a81f3a ceremonial cloth with
gold #e0a92c embroidery, wearing an ornate gold headplate and gold tusk rings. The
elephant stands on an antique gold heraldic shield base decorated with Mughal paisley
filigree engraving, and a small gold royal crown sits above its head. Warm gold rim
lighting from behind, molten gold metallic highlights on the ornaments. The silhouette
must be bold and instantly readable at small size and at low opacity, and must have the
same visual weight and framing as a matching peacock crest in the same set. Glossy
premium mobile game art, high-detail digital painting, rich saturated colours,
not photorealistic. Transparent background, no background elements, no text,
no letters, no numbers, no watermark, no logo.
```

### B5 — Card back · `card-back.webp`

Generate **1024×1024**, transparent outside the rounded rectangle, then crop to 5:7 (640×896).

```
A single playing card seen from the back, viewed perfectly straight-on and flat with no
perspective or tilt, filling the frame as a vertical rounded rectangle with a 5:7 aspect
ratio, on a fully transparent background. The card back design: a deep royal maroon
#4a0f1e field covered edge to edge with a symmetrical antique gold #d4a02c Mughal jaali
lattice pattern of interlocking paisley and lotus motifs. A clean gold double-rule
border runs just inside the card edge, and a single ornate gold medallion rosette sits
in the exact centre. The pattern is perfectly symmetrical both horizontally and
vertically. Crisp clean vector-like detail, rich saturated colours, subtle glossy sheen,
premium mobile game art, not photorealistic. Transparent background outside the rounded
card edges, no shadow, no perspective, no text, no letters, no numbers, no watermark,
no logo, no card suits, no card faces.
```

### B6 — Winner burst · `win-burst.webp`

Generate **1024×1024**, **transparent background**. Fires over the winning hand on reveal.

```
A dramatic celebratory burst effect on a fully transparent background, centered and
radially symmetrical. Brilliant golden light rays explode outward from the centre in all
directions, wrapped by an open laurel wreath of gold leaves curving up both sides, with
an ornate royal gold crown at the top centre. Scattered gold sparkles, small glowing
embers and flecks of gold dust fly outward from the centre. The exact middle is left
open and empty so game content can sit inside it. Bright antique gold #d4a02c and warm
highlight gold #f0c75e only. Glossy premium mobile game art, high-detail digital
painting, intense radiant lighting, not photorealistic. Transparent background,
no background elements, no text, no letters, no numbers, no watermark, no logo.
```

### B8 — Loading screen · `brand/loading/teen-patti.webp`

Generate **1024×1536** (portrait), opaque, then upscale to 1080×1920.

> Composition constraints are load-bearing: a brand mark overlays the top and the game
> name + tagline + progress bar overlay the bottom, and `object-cover` crops the sides on
> 9:16 phones. Keep both end zones clear and the subject inside the central 70% of width.

```
A vertical portrait mobile game loading screen, dark and moody with low contrast. An
opulent Mughal-era Indian royal card room at night: a deep-emerald velvet card table in
the middle distance with three ornate maroon-and-gold playing cards laid face down in a
row on it, warm brass oil lamps glowing softly on either side, carved marble arches with
gold jaali lattice screens behind, deep maroon velvet drapes falling on both sides. Warm
golden lamplight pooling in the centre of the frame and falling off into deep shadow
toward all edges. The top fifth and the bottom third of the image are kept dark, empty
and uncluttered, with no detail in them. The main subject stays within the central 70
percent of the image width, well away from the left and right edges. Rich but subdued
colours, cinematic warm lighting, atmospheric haze, high-detail digital painting,
premium mobile game art, not photorealistic. No text, no letters, no numbers,
no watermark, no logo, no people, no hands, no faces.
```

### B9 — Promo banner · `brand/promotions/games/teen-patti.png`

Generate **1536×1024**, opaque, then crop to a 3:1 strip (1200×400).

```
A wide horizontal 3:1 banner illustration for a mobile casino game promotion. The LEFT
half is a deep dark emerald-to-black gradient, almost empty and free of detail, so that
text can be overlaid on it later. The RIGHT half holds the artwork: three ornate
maroon-and-gold playing cards fanned out in mid-air, a scatter of gold casino chips and
gold coins tumbling around them, an antique gold Mughal paisley filigree flourish
sweeping behind, and warm golden light blooming from the right edge. Rich saturated
emerald green, royal maroon and antique gold #d4a02c colours, dramatic warm rim
lighting, glossy high-detail digital painting, premium mobile game art,
not photorealistic. No text, no letters, no numbers, no watermark, no logo,
no people, no hands.
```

---

## 6. B7 — Lobby card art (hand-coded, no prompt)

`TeenPattiArt` lives in `components/protected/game-card-art.tsx` and registers in
`components/lobby/lobby-grid.tsx` → `GameArt`, exactly like the other eleven. Hand-code it
as inline SVG in the existing house style — do **not** generate this one; it has to sit in a
grid beside `DragonTigerArt` and `MinesArt` and match their line weight.

Spec: three cards fanned from the lower-left, the front card showing a gold medallion,
against the emerald→black gradient from `LIVE_GAMES.gradient`; a small gold paisley flourish
top-right; glow `rgba(212,160,44,0.32)`.

> **Optional fallback:** if you'd rather trace than draw, generate a concept with the B9
> prompt above and vectorise it ([vectorizer.ai](https://vectorizer.ai) or Illustrator
> Image Trace) — but hand-coding is faster here and stays on-brand.

---

## 7. SFX prompts

Ship to `public/sounds/teen-patti/`, mono MP3 ~128 kbps. Each prompt is written for
**ElevenLabs SFX** (text→sound) and works as a search phrase on Pixabay/Mixkit too.

> ⚠️ **Licensing:** the ElevenLabs **free** plan is non-commercial and requires
> attribution. Audio generated there is fine for local dev and review builds, but before
> these files ship on a real-money product you need a paid ElevenLabs plan (which grants
> the commercial licence and lets you re-download the same clips), or the CC0 fallbacks
> below. Treat everything generated on free as **placeholder**.

### Free-plan budget

The free plan is **10,000 credits/month**. The SFX tool bills **by clip length, ~40
credits per second** — so setting an explicit short duration saves credits as well as
saving the sound. (Leaving duration on `Auto` assumes ~5 s and quotes 200 credits; that's
where the "200" in the UI comes from, it is not a flat per-generation fee.) One
**Generate** returns **4 variations** for that single charge — audition all four,
download one.

| File | Generate? | Length | Per gen | ×2 gens |
|---|---|---|---|---|
| `card-deal.mp3` | yes | 0.5 s | 20 | 40 |
| `reveal-low.mp3` | yes | 1.0 s | 40 | 80 |
| `reveal-mid.mp3` | yes | 1.5 s | 60 | 120 |
| `reveal-high.mp3` | yes | 2.0 s | 80 | 160 |
| `bg-loop.mp3` | **no** — reuse / CC0 | — | 0 | 0 |
| `chip-place.mp3` | **no** — reuse §8 | — | 0 | 0 |
| win / loss / click | **no** — reuse §8 | — | 0 | 0 |
| **Total** | | | **200** | **400** (4% of monthly) |

At these rates there's no reason to accept a mediocre take — a dozen attempts at each
sound still costs under a quarter of the monthly allowance.

### Two free-plan gotchas in the SFX UI

- **"Generations may be shared to Explore page for other users to download."** Click the
  **Disable** link next to that notice, or the game's SFX become publicly downloadable. If
  the toggle is gated behind Upgrade, add it to the reasons for the paid re-download.
- **Prompt enhancement** (the wand chip beside the prompt-influence %) rewrites your
  prompt before generating. **Turn it off** — the prompts below are deliberately worded
  around the known failure modes ("no lead-in silence", "no reverb, no tail").

### Settings for every generation

- **Duration: turn `Auto` OFF** and set the explicit value from the table below. On Auto
  the model pads clips with room tone and long tails, which is exactly wrong for a
  40 ms-spaced deal.
- **Prompt influence:** high (~0.7–0.8) for `card-deal` — it's a literal foley sound and
  you want obedience. Medium (~0.4–0.5) for the three reveal stings — they're musical, and
  too much influence makes them stiff.
- **Looping (`∞`): off** for all four. None of these loop; only `bg-loop` would, and
  we're not generating that one.

| File | Duration | Prompt influence |
|---|---|---|
| `card-deal.mp3` | 0.5 s (the floor — trim to ~0.35 s after, see below) | 0.8 |
| `reveal-low.mp3` | 1.0 s | 0.5 |
| `reveal-mid.mp3` | 1.5 s | 0.45 |
| `reveal-high.mp3` | 2.0 s | 0.4 |

### `card-deal.mp3` — fires 6× on the deal, ~40 ms apart

```
A single crisp playing card being dealt and sliding across a soft felt table, short
and dry, a quick paper flick with a light snap at the end. Starts immediately with no
lead-in silence. No reverb, no tail, no music, clean and dry.
```

Reject any take with audible lead-in silence or a reverb tail — at 40 ms spacing six of
those turn into mud. The `silenceremove` step below fixes small offenders.

### `reveal-low.mp3` — High Card / Pair

```
A short understated card reveal chime for a small win in a casino game. One soft warm
bell note with a gentle shimmer tail. Modest and restrained, not triumphant. No music
bed, no drums, no lead-in silence.
```

### `reveal-mid.mp3` — Colour / Sequence

```
An uplifting card reveal sting for a good win in a casino game. A bright rising
three-note chime on tuned bells with a warm sitar-like pluck underneath and a soft
shimmer tail. Confident and pleasing but not a jackpot. No drums, no vocals, no
lead-in silence.
```

### `reveal-high.mp3` — Pure Sequence / Trail

```
A triumphant jackpot reveal fanfare for a rare big win in an Indian-themed casino game.
A bright ascending brass and tuned-bell flourish with a tabla hit and a shimmering gong
swell, ending on a big sustained golden chord. Grand and celebratory. No vocals, no
lead-in silence.
```

Note the duration cap in the prompts is gone — the duration control does that job, and
saying "about 2 seconds" in the text just wastes prompt tokens on a knob you already set.

### `bg-loop.mp3` — table ambience, 60–90 s seamless

**Do not generate this on ElevenLabs.** SFX is capped at ~22 s and does not produce
seam-free musical loops; the Music tool would cost a large slice of the monthly budget
for one asset. Two better options, in order:

1. **Reuse** `public/sounds/dragon-tiger/bg-loop.mp3` — same house style, already
   loop-tested in a shipped game, zero credits, zero licensing question. Copy it to
   `public/sounds/teen-patti/bg-loop.mp3` so the game keeps its own folder.
2. **CC0 from Pixabay** if you want a distinct bed. Search terms: `sitar ambient loop`,
   `indian lounge background`, `tabla chill loop`. Then loop-check it: if the tail doesn't
   meet the head, crossfade the last 2 s over the first 2 s.

Prompt kept for reference if you later generate it on a paid plan:

```
A calm looping background music bed for a luxurious Indian casino card table. Soft
sitar and tanpura drone, gentle tabla rhythm played lightly, warm low strings, relaxed
and hypnotic, sitting quietly under gameplay without demanding attention. Seamless
loop, no vocals, no sudden dynamic changes.
```

### Post-processing

**Download format: `WAV 48kHz`, not MP3.** The download menu offers both; take WAV. These
clips get trimmed, normalised and re-encoded to mono 128 kbps MP3, and starting from MP3
means encoding a lossy file twice — worst on `card-deal`, where a sharp transient is
exactly what MP3 smears. WAV is the lossless master; compress once, at the end. (If WAV
is paid-only on your plan, MP3 is an acceptable fallback for a 0.35 s click.)

ElevenLabs hands back stereo audio with variable loudness and often a few ms of lead-in.
Normalise everything to mono / 128 kbps and trim the heads, matching the other games:

```bash
# one-time: winget install Gyan.FFmpeg   (then reopen the shell)

cd public/sounds/teen-patti

# trim lead-in silence + hard-trim the deal click to 0.35 s
ffmpeg -y -i card-deal-raw.wav \
  -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0,loudnorm=I=-16:TP=-1.5" \
  -t 0.35 -ac 1 -b:a 128k card-deal.mp3

# reveal stings: trim lead-in, keep the tail
for f in reveal-low reveal-mid reveal-high; do
  ffmpeg -y -i "$f-raw.wav" \
    -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0,loudnorm=I=-16:TP=-1.5" \
    -ac 1 -b:a 128k "$f.mp3"
done

# reused bed — already copied from dragon-tiger, just downmix to mono
ffmpeg -y -i bg-loop.mp3 -ac 1 -b:a 128k bg-loop-mono.mp3 && mv bg-loop-mono.mp3 bg-loop.mp3
```

Download the ElevenLabs results as `*-raw.wav` in that folder, run the above, then delete
the `-raw` files. If you'd rather not install ffmpeg, Audacity does the same job by hand:
Effect → Normalize to −16 LUFS, Tracks → Mix → Stereo to Mono, export MP3 at 128 kbps.

### Optional: dealer voice callouts

Not in the spec and not required to ship. If you want them, ElevenLabs TTS draws from the
**same 10,000-credit pool** (~1 credit per character), so seven short lines cost well
under 200 credits total — cheaper than a single SFX generation.

Lines: `"Place your bets"` · `"Bets closed"` · `"High card"` · `"Pair"` · `"Colour"` ·
`"Sequence"` · `"Pure sequence"` · `"Trail"`. Ship to
`public/sounds/teen-patti/voice/<slug>.mp3` and gate them behind the existing `sfx`
volume setting at ~0.6, so a player who mutes SFX doesn't get a talking dealer. Pick one
calm mid-range voice and use it for every line — mixing voices reads as a bug.

---

## 8. Reuse from Dragon vs Tiger — do NOT regenerate

Already in the repo and directly usable:

| Asset | Path |
|---|---|
| Chip set (7 denominations) | `public/games/dragon-tiger/chip-set/` |
| Bot avatars (12) | `public/games/dragon-tiger/avatar-pack/` |
| Gold coin icon | `public/games/dragon-tiger/coin.webp` |
| Crown badge | `public/games/dragon-tiger/crown.webp` |
| All 52 card faces | `components/games/_shared/playing-card.tsx` (rendered, zero images) |
| Chip-place SFX | `public/sounds/dragon-tiger/chip-place.mp3` |
| Win / loss / click SFX | `public/sounds/{win,loss,button-click}.mp3` |
| Table ambience bed | `public/sounds/dragon-tiger/bg-loop.mp3` → copy as teen-patti's `bg-loop.mp3` |
| Confetti · haptics | `lib/confetti.ts` · `lib/haptics.ts` |

---

## 9. Checklist

- [x] B1 `bg-table.webp` — table background **(P0)**
- [x] B2a–B2f rank badges ×6 **(P0)**
- [x] B7 `TeenPattiArt` lobby card art **(P0)** — built in
      `components/protected/game-card-art.tsx`, registered in `CARD_ART`. Follows
      `DragonTigerArt`'s construction (composited round art, not flat SVG): peacock crest
      left, elephant crest right, the Trail medallion standing in for DT's VS emblem.
- [x] B3 `crest-a.webp` · B4 `crest-b.webp`
- [x] B5 `card-back.webp`
- [x] B6 `win-burst.webp`
- [x] B8 `brand/loading/teen-patti.webp`
- [x] `card-deal` · `reveal-{low,mid,high}` — 8 ElevenLabs SFX gens, ~400 credits
- [x] `bg-loop.mp3` — copied from `dragon-tiger/`, **do not generate**
- [ ] Re-download the four SFX on a paid plan before the money build (free = non-commercial)
      — **and take the MP3 download, not WAV.** They landed as 48 kHz stereo `.wav`
      (`card-deal` 90 KB, `reveal-low` 188 KB, `reveal-mid` 278 KB, `reveal-high` 375 KB);
      every other game on the platform ships `.mp3` and `lib/sound.ts` loads via plain
      `new Audio()`. Same download, ~930 KB → ~110 KB.
- [x] B9 `brand/promotions/games/teen-patti.png` (P2)

**Remaining to ship: B7 only.** Everything else is done or has a working fallback.

---

## 10. First-pass results (2026-09-05)

13 generated PNGs came in at **26.4 MB**; shipped WebP is **3.8 MB** — an 86% cut with no
visible loss. Two files were generated into the wrong folder and have been relocated:

| Was | Now |
|---|---|
| `public/games/teen-patti/loading-teen-patti.png` | `public/brand/loading/teen-patti.webp` |
| `public/games/teen-patti/games-teen-patti.png` | `public/brand/promotions/games/teen-patti.png` |

The 13 PNG masters were staged in git (26 MB of permanent history) and have been moved to
`art-src/teen-patti/`, now gitignored.

**Nothing was alpha-trimmed, deliberately.** The six rank badges swap into the same UI slot
and the crests are a matched pair — trimming each to its own bounding box would leave them
rendering at different visual scales. The uniform transparent margin costs almost nothing in
WebP.

Quality checks passed: alpha coverage 19–78% on every sprite (no flattened backgrounds), the
badge tier hierarchy reads correctly from Trail down to High Card, and file sizes sit in the
same band as the Dragon vs Tiger equivalents (`vs-burst` 314 KB vs `win-burst` 422 KB,
`dragon-mark` 160 KB vs `crest-a` 198 KB).
