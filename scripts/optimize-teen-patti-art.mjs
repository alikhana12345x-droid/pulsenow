// Normalise + optimise the generated Teen Patti art.
//
//   node scripts/optimize-teen-patti-art.mjs            # report only
//   node scripts/optimize-teen-patti-art.mjs --convert  # write targets, KEEP originals
//   node scripts/optimize-teen-patti-art.mjs --cleanup  # delete the source PNGs
//
// Same two-phase stance as optimize-loading-art.mjs: the art is dark and
// gradient-heavy (exactly what lossy WebP bands on), so the output gets eyeballed
// before anything is deleted.
//
// What it does:
//   • moves the two misfiled assets out of public/games/teen-patti/ into the
//     brand folders the code actually reads (loading screen, promo banner)
//   • trims the transparent margin off every sprite so the art fills its box
//   • downscales to ship size (never upscales — no fabricated detail)
//   • re-encodes to WebP (PNG kept for the promo banner, per repo convention)

import sharp from "sharp";
import { copyFileSync, existsSync, mkdirSync, statSync, unlinkSync } from "fs";
import { dirname, join } from "path";

const SRC = "public/games/teen-patti";
const CONVERT = process.argv.includes("--convert");
const CLEANUP = process.argv.includes("--cleanup");

// src basename → { out, w, h, alpha, fit, format, q }
//
// Sizes below are the SOURCES' own dimensions where the generator already landed
// on-spec (never upscale — it only fabricates detail and bytes). Two notes:
//
//  • Nothing is alpha-trimmed. The six rank badges swap into the same UI slot and
//    the two crests are a matched pair, so trimming each to its own bounding box
//    would leave them rendering at different visual scales. A uniform transparent
//    margin costs almost nothing in WebP.
//  • bg-table + the promo banner keep native size to match dragon-tiger's
//    (1536x1024 / 2172x724); loading art matches the other 11 (~941x1672).
const TARGETS = {
  "bg-table.png":          { out: "public/games/teen-patti/bg-table.webp",            w: 1145, h: 1374, alpha: false, fit: "inside", q: 78 },
  "rank-trail.png":        { out: "public/games/teen-patti/rank-trail.webp",           w: 512,  h: 512,  alpha: true,  fit: "inside", q: 88 },
  "rank-pure-seq.png":     { out: "public/games/teen-patti/rank-pure-seq.webp",        w: 512,  h: 512,  alpha: true,  fit: "inside", q: 88 },
  "rank-seq.png":          { out: "public/games/teen-patti/rank-seq.webp",             w: 512,  h: 512,  alpha: true,  fit: "inside", q: 88 },
  "rank-colour.png":       { out: "public/games/teen-patti/rank-colour.webp",          w: 512,  h: 512,  alpha: true,  fit: "inside", q: 88 },
  "rank-pair.png":         { out: "public/games/teen-patti/rank-pair.webp",            w: 512,  h: 512,  alpha: true,  fit: "inside", q: 88 },
  "rank-high.png":         { out: "public/games/teen-patti/rank-high.webp",            w: 512,  h: 512,  alpha: true,  fit: "inside", q: 88 },
  "crest-a.png":           { out: "public/games/teen-patti/crest-a.webp",              w: 768,  h: 768,  alpha: true,  fit: "inside", q: 85 },
  "crest-b.png":           { out: "public/games/teen-patti/crest-b.webp",              w: 768,  h: 768,  alpha: true,  fit: "inside", q: 85 },
  "card-back.png":         { out: "public/games/teen-patti/card-back.webp",            w: 640,  h: 896,  alpha: true,  fit: "inside", q: 82 },
  "win-burst.png":         { out: "public/games/teen-patti/win-burst.webp",            w: 1024, h: 1024, alpha: true,  fit: "inside", q: 78 },
  "loading-teen-patti.png":{ out: "public/brand/loading/teen-patti.webp",              w: 948,  h: 1659, alpha: false, fit: "inside", q: 80 },
  // Already 2172x724 — exactly dragon-tiger.png's size. Re-encoding through sharp
  // made it BIGGER (2038 KB -> 2618 KB), so copy the source bytes untouched.
  "games-teen-patti.png":  { out: "public/brand/promotions/games/teen-patti.png",      w: 2172, h: 724,  alpha: false, copy: true },
};

const kb = (n) => `${Math.round(n / 1024)} KB`;

async function alphaStats(file) {
  const m = await sharp(file).metadata();
  if (!m.hasAlpha) return { hasAlpha: false, pctTransparent: 0 };
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let t = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] < 250) t++;
  return { hasAlpha: true, pctTransparent: (t / (info.width * info.height)) * 100 };
}

console.log(CONVERT ? "── converting ──" : CLEANUP ? "── cleanup ──" : "── report only (pass --convert to write) ──\n");

let totalIn = 0, totalOut = 0;

for (const [name, t] of Object.entries(TARGETS)) {
  const src = join(SRC, name);
  if (!existsSync(src)) { console.log(`MISSING  ${name}`); continue; }

  const inSize = statSync(src).size;
  totalIn += inSize;
  const m = await sharp(src).metadata();
  const a = await alphaStats(src);

  const flags = [];
  if (t.alpha && !a.hasAlpha) flags.push("!! NO ALPHA CHANNEL");
  else if (t.alpha && a.pctTransparent < 1) flags.push(`!! alpha present but only ${a.pctTransparent.toFixed(1)}% transparent`);
  if (!t.alpha && a.hasAlpha && a.pctTransparent > 1) flags.push(`!! ${a.pctTransparent.toFixed(1)}% transparent on an opaque asset`);
  if (m.width < t.w || m.height < t.h) flags.push(`!! source ${m.width}x${m.height} smaller than target ${t.w}x${t.h}`);

  console.log(
    `${name.padEnd(24)} ${String(m.width).padStart(5)}x${String(m.height).toString().padEnd(5)} ${m.format.padEnd(4)} ${kb(inSize).padStart(8)}` +
    `${a.hasAlpha ? `  alpha ${a.pctTransparent.toFixed(1)}%` : "  opaque   "}  →  ${t.out}  ${t.w}x${t.h}` +
    (flags.length ? `\n   ${flags.join("\n   ")}` : "")
  );

  if (!CONVERT) continue;

  mkdirSync(dirname(t.out), { recursive: true });

  if (t.copy) {
    copyFileSync(src, t.out);
    totalOut += statSync(t.out).size;
    console.log(`   copied verbatim  ${kb(statSync(t.out).size)}`);
    continue;
  }

  let p = sharp(src);
  if (t.trim) p = p.trim({ threshold: 1 });                 // drop the empty transparent margin
  p = p.resize({ width: t.w, height: t.h, fit: t.fit, withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (!t.alpha) p = p.flatten({ background: "#07241c" });
  p = t.format === "png" ? p.png({ compressionLevel: 9 }) : p.webp({ quality: t.q, alphaQuality: 100 });
  await p.toFile(t.out);

  const outSize = statSync(t.out).size;
  totalOut += outSize;
  const om = await sharp(t.out).metadata();
  console.log(`   wrote ${om.width}x${om.height}  ${kb(outSize)}`);
}

if (CONVERT) console.log(`\ntotal  ${kb(totalIn)} → ${kb(totalOut)}`);

if (CLEANUP) {
  for (const name of Object.keys(TARGETS)) {
    const src = join(SRC, name);
    if (existsSync(src)) { unlinkSync(src); console.log(`deleted ${src}`); }
  }
}
