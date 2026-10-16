import { timingSafeEqual } from "node:crypto";

// ─── Round-peek access control ────────────────────────────────────────────────
// Guards the unlisted /x/<slug> page that mirrors live skyrise rounds. The path
// itself is the only secret: anyone holding the full URL can open the page and
// its feed, so share it like a password. It is server-only (never NEXT_PUBLIC_)
// and not stored in the DB — rotating it is an env change plus a redeploy.

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch. Length isn't the secret worth
  // protecting here — the bytes are — so short-circuit on it and compare the
  // rest in constant time.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * A missing or stub-length slug fails closed — an un-configured deployment
 * 404s rather than serving the page on a guessable path.
 */
function peekSlug(): string | null {
  const slug = process.env.PEEK_SLUG;
  return slug && slug.length >= 24 ? slug : null;
}

export function slugMatches(candidate: string): boolean {
  const slug = peekSlug();
  return slug !== null && constantTimeEqual(candidate, slug);
}
