// One-off: normalise + optimise the game loading art in public/brand/loading/.
//
//   node scripts/optimize-loading-art.mjs            # report only
//   node scripts/optimize-loading-art.mjs --convert  # write .webp, KEEP originals
//   node scripts/optimize-loading-art.mjs --cleanup  # delete the originals + dead SVGs
//
// Two phases on purpose: the art is dark gradient-heavy, which is exactly what
// lossy WebP bands on, so the .webp output gets eyeballed before anything is
// deleted.
//
// What it does:
//   • renames the hand-generated "Andar Bahar.png" style files to kebab-case slugs
//   • downscales anything larger than 1080×1920 (never upscales), preserving ratio
//   • re-encodes to WebP q80 — these are full-screen 1.2–1.9 MB PNGs today
//   • deletes the unreferenced *-portrait.svg files (~15 MB, superseded by the PNGs)

import sharp from "sharp";
import { readdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

const DIR = "public/brand/loading";
const CONVERT = process.argv.includes("--convert");
const CLEANUP = process.argv.includes("--cleanup");
const APPLY = CONVERT || CLEANUP;
const MAX_W = 1080;
const MAX_H = 1920;
const QUALITY = 80;

// Source filename → target slug. The first batch arrived title-cased with spaces;
// re-rolls arrive as "<slug>-N.png". Anything not listed keeps its own basename.
const RENAME = {
  "Andar Bahar.png": "andar-bahar",
  "Dragon Tower.png": "dragon-tower",
  "Keno.png": "keno",
  "Limbo.png": "limbo",
  "Plinko.png": "plinko",
  "keno-1.png": "keno",
};

// Unreferenced: nothing in the codebase or docs points at these. Superseded by
// the same-named .png files that GAME_CONFIG actually uses.
const DELETE = [
  "cards-portrait.svg",
  "coin-flip-portrait.svg",
  "dice-roll-portrait.svg",
  "mines-portrait.svg",
  "sky-rise-portrait.svg",
];

const kb = (n) => `${Math.round(n / 1024)} KB`;
const files = readdirSync(DIR);
let before = 0;
let after = 0;

console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${DIR}\n`);
console.log("PNG → WebP");
console.log("─".repeat(78));

for (const f of files.filter((f) => f.toLowerCase().endsWith(".png")).sort()) {
  const src = join(DIR, f);
  const slug = RENAME[f] ?? f.replace(/\.png$/i, "");
  const out = join(DIR, `${slug}.webp`);
  const srcBytes = statSync(src).size;
  before += srcBytes;

  const img = sharp(src);
  const meta = await img.metadata();
  const resized =
    meta.width > MAX_W || meta.height > MAX_H
      ? img.resize({ width: MAX_W, height: MAX_H, fit: "inside", withoutEnlargement: true })
      : img;

  const buf = await resized.webp({ quality: QUALITY }).toBuffer();
  const outMeta = await sharp(buf).metadata();
  after += buf.length;

  const renamed = slug !== f.replace(/\.png$/i, "") ? "  (renamed)" : "";
  const scaled = outMeta.width !== meta.width ? ` ↓${meta.width}x${meta.height}` : "";
  console.log(
    `${f.padEnd(22)} ${String(meta.width + "x" + meta.height).padEnd(11)} ${kb(srcBytes).padEnd(9)}` +
    `→  ${(slug + ".webp").padEnd(20)} ${String(outMeta.width + "x" + outMeta.height).padEnd(11)} ${kb(buf.length).padEnd(8)}` +
    `${Math.round((1 - buf.length / srcBytes) * 100)}% smaller${scaled}${renamed}`,
  );

  // Write the encoded buffer straight to disk. Going back through
  // sharp(buf).toFile(out) would decode and re-encode it — a second lossy WebP
  // pass on top of the first, for no benefit.
  if (CONVERT) writeFileSync(out, buf);
  if (CLEANUP) unlinkSync(src);
}

console.log("─".repeat(78));
console.log(`total  ${kb(before)} → ${kb(after)}   (${Math.round((1 - after / before) * 100)}% smaller)\n`);

console.log("Delete (unreferenced)");
console.log("─".repeat(78));
let freed = 0;
for (const f of DELETE) {
  const p = join(DIR, f);
  try {
    freed += statSync(p).size;
    console.log(`${f.padEnd(30)} ${kb(statSync(p).size)}`);
    if (CLEANUP) unlinkSync(p);
  } catch {
    console.log(`${f.padEnd(30)} already gone`);
  }
}
console.log("─".repeat(78));
console.log(`frees ${kb(freed)}`);
console.log(`\nfolder: ${kb(before + freed)} → ${kb(after)}`);
if (!APPLY) console.log("\n--convert to write the .webp files, then --cleanup to delete originals.");
