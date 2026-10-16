import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import {
  OAUTH_INTENT_COOKIE,
  parseOAuthIntent,
  safeOAuthNext,
} from "@/lib/auth/oauth";

/**
 * OAuth callback (Google, etc.).
 *
 * Cookies are captured from the Supabase client and written onto the redirect
 * response explicitly rather than through `next/headers`. The session is
 * created here and consumed by the very next request, so losing the Set-Cookie
 * header on the redirect would drop the user back on the landing page still
 * signed out — the classic "OAuth does nothing" symptom.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  let pendingCookies: Array<{ name: string; value: string; options: object }> = [];

  // A RELATIVE Location header, deliberately — not NextResponse.redirect().
  //
  // NextResponse.redirect() needs an absolute URL, and the only origin
  // available here is `request.url`, which in production is built from the
  // server's own listen address (http://localhost:3000) rather than the public
  // host: Caddy forwards to 127.0.0.1:3000, so this route redirected live users
  // to https://localhost:3000. A relative Location is resolved by the browser
  // against the URL it actually requested, so it is correct behind any proxy
  // and in local dev alike.
  const redirectTo = (path: string) => {
    const response = new NextResponse(null, {
      status: 303,
      headers: { Location: path },
    });
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(
        name,
        value,
        options as Parameters<typeof response.cookies.set>[2],
      );
    });
    // One-shot: the intent has been consumed (or the attempt failed), so it
    // must not leak into the next sign-in.
    response.cookies.set(OAUTH_INTENT_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  };

  const fail = (message: string) =>
    redirectTo(`/auth/error?error=${encodeURIComponent(message)}`);

  // Where the user was headed, and any referral code, stashed by the form
  // before it handed off to Google. Falls back to the lobby rather than
  // `/protected` (a redirect stub) to save a hop.
  const intent = parseOAuthIntent(request.cookies.get(OAUTH_INTENT_COOKIE)?.value);
  // A `?next=` on the callback itself still wins if present, so an explicit
  // link keeps working.
  const next = safeOAuthNext(searchParams.get("next")) ?? intent.next ?? "/";
  const referralCode = intent.ref;

  // The provider (or Supabase itself) reports failures as query params, not a
  // code: consent denied, provider misconfigured, redirect URL not allow-listed,
  // an email already claimed by another identity. Surface the real reason
  // instead of the misleading "no code" message.
  const providerError =
    searchParams.get("error_description") ??
    searchParams.get("error_code") ??
    searchParams.get("error");
  if (providerError) {
    return fail(providerError);
  }

  const code = searchParams.get("code");
  if (!code) {
    return fail(
      "That sign-in link is incomplete or has already been used. Please try signing in again.",
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pendingCookies = [...pendingCookies, ...cookiesToSet];
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.user) {
    const message = error?.message ?? "Google sign-in failed";
    // No verifier cookie = the callback was opened in a different browser than
    // the one that started the flow, or the code was already redeemed (a reload
    // of this URL). Both are recoverable by starting over.
    if (/verifier|expired|invalid/i.test(message)) {
      return fail(
        "This sign-in attempt expired or was already used. Please tap “Continue with Google” again in the same browser.",
      );
    }
    return fail(message);
  }

  const user = data.user;

  try {
    // Single-device enforcement: revoke every other session, keep this one.
    // Uses the user client (not admin) so "others" correctly identifies the
    // session we just created as the one to preserve.
    await supabase.auth.signOut({ scope: "others" });
  } catch (e) {
    console.error("[auth/callback] signOut(others) error:", e);
  }

  try {
    await ensureUserProfile(user.id, {
      ...(user.user_metadata ?? {}),
      // The code the user typed on the sign-up form beats anything the
      // provider happened to send.
      ...(referralCode ? { referred_by_code: referralCode } : {}),
    });
  } catch (e) {
    console.error("[auth/callback] ensureUserProfile error:", e);
    return fail("Failed to set up your account. Please try again.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_banned, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_banned) {
    return redirectTo("/auth/banned");
  }

  if (profile?.role === "admin" || profile?.role === "superadmin") {
    return redirectTo("/admin");
  }

  // Google normally supplies a name, so `ensureUserProfile` has already filled
  // `display_name` in. If the provider sent none, finish onboarding first —
  // otherwise the proxy would bounce the user there mid-navigation anyway.
  if (!profile?.display_name && next.startsWith("/protected")) {
    return redirectTo("/protected/onboarding");
  }

  return redirectTo(next);
}
