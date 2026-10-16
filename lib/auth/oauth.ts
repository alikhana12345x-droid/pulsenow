/**
 * OAuth intent hand-off.
 *
 * OAuth leaves the app entirely, so anything the flow needs on the way back
 * (where the user was headed, a referral code) has to survive the round trip —
 * `signInWithOAuth` has no equivalent of the `options.data` metadata that
 * `signUp` accepts.
 *
 * It travels in a short-lived cookie rather than in the `redirectTo` URL on
 * purpose: Supabase validates `redirectTo` against the dashboard's
 * Authentication → URL Configuration → Redirect URLs allow-list, and an entry
 * without a wildcard does not match a URL carrying a query string. A rejected
 * `redirectTo` is silently replaced with the project's Site URL, dropping the
 * user on the home page still signed out. Keeping the callback URL bare means
 * a plain `https://<domain>/auth/callback` entry is enough.
 *
 * `SameSite=Lax` is required and sufficient: the return trip from Google is a
 * top-level GET navigation, which Lax permits.
 */

/**
 * Hides "Continue with Google" on the login and sign-up forms. This only
 * removes the button — to block Google sign-in outright, also disable the
 * provider in Supabase (Authentication → Providers → Google).
 */
export const GOOGLE_AUTH_ENABLED = false;

export const OAUTH_INTENT_COOKIE = "bp_oauth_intent";

const INTENT_TTL_SECONDS = 600;

export interface OAuthIntent {
  next?: string;
  ref?: string;
}

/** Internal paths only — this value ends up driving a post-login redirect. */
export function safeOAuthNext(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (!path.startsWith("/") || path.startsWith("//")) return undefined;
  return path;
}

/** Browser-side: stash the intent, then return the bare callback URL. */
export function startOAuthRedirect(intent: OAuthIntent = {}): string {
  const payload: OAuthIntent = {};

  const next = safeOAuthNext(intent.next);
  if (next) payload.next = next;

  const ref = intent.ref?.trim();
  if (ref) payload.ref = ref;

  const value = Object.keys(payload).length
    ? encodeURIComponent(JSON.stringify(payload))
    : "";

  // An empty value with Max-Age=0 clears a stale intent from an abandoned
  // attempt, so a later sign-in can't inherit someone else's destination.
  document.cookie = `${OAUTH_INTENT_COOKIE}=${value}; Path=/; Max-Age=${
    value ? INTENT_TTL_SECONDS : 0
  }; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;

  return `${window.location.origin}/auth/callback`;
}

/** Server-side: read the intent cookie back, tolerating anything malformed. */
export function parseOAuthIntent(raw: string | undefined): OAuthIntent {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const { next, ref } = parsed as Record<string, unknown>;
    return {
      next: typeof next === "string" ? safeOAuthNext(next) : undefined,
      ref: typeof ref === "string" && ref.trim() ? ref.trim() : undefined,
    };
  } catch {
    return {};
  }
}
