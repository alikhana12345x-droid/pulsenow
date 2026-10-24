import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { hasEnvVars } from "../utils";
import { db } from "@/lib/db";
import { profiles } from "@/lib/supabase/schema";
import { isMaintenanceModeEnabled } from "@/lib/settings/maintenance";

const AUTH_ENTRY_PATHS = new Set([
  "/",
  "/auth/login",
  "/auth/sign-up",
  "/auth/sign-up-success",
]);

function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "superadmin";
}

// The round monitor (app/x/[slug] + its feed API) carries its own slug+password
// gate and is meant for people with no account at all, so it must not be pushed
// into the login modal below. Skipping the whole Supabase session round-trip
// also keeps its 600 ms poll off the auth path. Matched with a trailing slash so
// ordinary routes beginning with "x" are unaffected.
function isRoundMonitorPath(pathname: string) {
  return pathname.startsWith("/x/") || pathname.startsWith("/api/x/");
}

export async function updateSession(request: NextRequest) {
  if (!hasEnvVars) {
    return NextResponse.next({ request });
  }

  if (isRoundMonitorPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  // Supabase silently substitutes the project's Site URL when `redirectTo`
  // isn't in the dashboard's Redirect URLs allow-list, so an OAuth callback can
  // land on `/?code=...` instead of `/auth/callback`. Forward it to the real
  // handler before the page renders: left alone, the browser client exchanges
  // the code itself after hydration, so the server-rendered UI stays signed out
  // until the user happens to refresh — and the profile/wallet setup, ban check
  // and role routing in the callback never run at all.
  if (
    !request.nextUrl.pathname.startsWith("/auth/") &&
    !request.nextUrl.pathname.startsWith("/api/")
  ) {
    const params = request.nextUrl.searchParams;
    if (
      params.has("code") ||
      params.has("error_code") ||
      params.has("error_description")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/callback";
      // Remember where the code landed, unless the callback already knows or
      // it's just the lobby (the callback's own default).
      if (!params.has("next") && request.nextUrl.pathname !== "/") {
        url.searchParams.set("next", request.nextUrl.pathname);
      }
      return NextResponse.redirect(url);
    }
  }

  let pendingCookies: Array<{ name: string; value: string; options: object }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pendingCookies = cookiesToSet;
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const requestHeaders = new Headers(request.headers);
  if (pendingCookies.length > 0) {
    const cookieMap = new Map(request.cookies.getAll().map((c) => [c.name, c.value]));
    pendingCookies.forEach(({ name, value }) => cookieMap.set(name, value));
    requestHeaders.set("cookie", [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join("; "));
  }
  if (user?.sub) {
    requestHeaders.set("x-user-sub", user.sub);
  }

  const setPendingCookies = (response: NextResponse) => {
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
    });
    return response;
  };

  const pathname = request.nextUrl.pathname;

  // Skip role checks for API routes and auth routes — they handle their own auth.
  const isApiRoute  = pathname.startsWith("/api/");
  const isAuthRoute = pathname.startsWith("/auth/");

  // ── Maintenance mode ─────────────────────────────────────────────────────
  // A superadmin flips this from /admin/settings to pause the whole app — the
  // lobby, the games, the admin panel itself — for everyone else, including
  // signed-out visitors. /auth/* and /api/* stay open so a superadmin can
  // still sign in and webhooks keep flowing.
  if (!isApiRoute && !isAuthRoute && (await isMaintenanceModeEnabled())) {
    let isSuperadmin = false;
    if (user?.sub) {
      const [profile] = await db
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, user.sub as string))
        .limit(1);
      isSuperadmin = profile?.role === "superadmin";
    }

    if (!isSuperadmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/maintenance";
      url.search   = "";
      return setPendingCookies(
        NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
      );
    }
  }

  // ── Unauthenticated ───────────────────────────────────────────────────────
  if (!user) {
    if (!isApiRoute && !isAuthRoute && pathname !== "/") {
      // Auth is an in-app modal on the landing page. Send the user there with
      // the login modal flagged, preserving where they were headed so we can
      // return them after sign-in.
      const target = pathname + (request.nextUrl.search || "");
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search   = `?auth=login&next=${encodeURIComponent(target)}`;
      return setPendingCookies(NextResponse.redirect(url));
    }
    return setPendingCookies(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // ── Authenticated: role-based routing ────────────────────────────────────
  // Only fetch the profile role when the destination actually needs it.
  const needsRoleCheck =
    AUTH_ENTRY_PATHS.has(pathname) ||
    pathname.startsWith("/protected") ||
    pathname.startsWith("/admin");

  if (needsRoleCheck) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_banned, ban_reason, display_name")
      .eq("id", user.sub as string)
      .maybeSingle();

    const isAdmin   = isAdminRole(profile?.role);
    const isBanned  = profile?.is_banned === true;
    const url       = request.nextUrl.clone();
    url.search      = "";

    // Banned users → blocked page (skip if already there)
    if (isBanned && pathname !== "/auth/banned") {
      url.pathname = "/auth/banned";
      return setPendingCookies(NextResponse.redirect(url));
    }

    // Auth entry pages → push into the app. The lobby "/" is now public, so
    // authenticated players stay on it; only admins are bounced to /admin.
    if (AUTH_ENTRY_PATHS.has(pathname)) {
      if (isAdmin) {
        url.pathname = "/admin";
        return setPendingCookies(NextResponse.redirect(url));
      }
      if (pathname !== "/") {
        url.pathname = "/";
        return setPendingCookies(NextResponse.redirect(url));
      }
      // player on "/" → fall through and render the lobby
    }

    // Admin must not access /protected or its sub-routes
    if (isAdmin && pathname.startsWith("/protected")) {
      url.pathname = "/admin";
      return setPendingCookies(NextResponse.redirect(url));
    }

    // Player must not access /admin or its sub-routes → send to the lobby
    if (!isAdmin && pathname.startsWith("/admin")) {
      url.pathname = "/";
      return setPendingCookies(NextResponse.redirect(url));
    }

    // Players without display_name → onboarding (skip if already there)
    if (!isAdmin && !profile?.display_name && pathname.startsWith("/protected") && pathname !== "/protected/onboarding") {
      url.pathname = "/protected/onboarding";
      return setPendingCookies(NextResponse.redirect(url));
    }
  }

  return setPendingCookies(NextResponse.next({ request: { headers: requestHeaders } }));
}
