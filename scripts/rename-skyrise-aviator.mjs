// scripts/rename-skyrise-aviator.mjs
// Usage: node scripts/rename-skyrise-aviator.mjs
// One-off: updates the EXISTING `games` row for slug='skyrise' to the new
// "Aviator" display name + plane emoji. Unlike seed-games.mjs (which is
// additive, ON CONFLICT DO NOTHING), this intentionally overwrites the title/
// emoji on the existing row — everything else (status, featured, sort_order,
// admin-uploaded images) is left untouched. Safe to re-run (idempotent).
// Requires DB_URL in .env.local.

import postgres from "postgres";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const raw = readFileSync(join(__dirname, "../.env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
} catch {
  /* assume env already exported */
}

if (!process.env.DB_URL) throw new Error("Missing env var: DB_URL");
const sql = postgres(process.env.DB_URL, { prepare: false });

async function main() {
  console.log("\n=== Renaming Skyrise -> Aviator ===\n");
  const res = await sql`
    UPDATE games
    SET title = 'Aviator', emoji = '✈️', updated_at = now()
    WHERE slug = 'skyrise'
    RETURNING slug, title, emoji
  `;
  if (res.length > 0) {
    console.log(`  ✓ ${res[0].slug} -> title="${res[0].title}" emoji="${res[0].emoji}"`);
  } else {
    console.log("  · no row with slug='skyrise' found (table not seeded yet — the code fallback already has the new name)");
  }
  console.log("\nDone.\n");
}

main()
  .catch((e) => { console.error("\n✗", e.message); process.exit(1); })
  .finally(() => sql.end());
