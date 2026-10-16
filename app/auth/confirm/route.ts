import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";

// Why server-side, not client-side:
// PKCE stores the code verifier in the browser's cookies (via @supabase/ssr).
// The server reads those cookies on every request, so it can exchange the code.
// Gmail/Outlook link scanners have no cookies → exchange fails without consuming
// the code → user's real click still works.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code       = searchParams.get("code");         // PKCE flow
  const token_hash = searchParams.get("token_hash");   // OTP / legacy flow
  const type       = searchParams.get("type") as EmailOtpType | null;
  const next       = searchParams.get("next") ?? "/protected";

  // Forward any Supabase error redirects
  const supabaseErr =
    searchParams.get("error_description") ??
    searchParams.get("error_code") ??
    searchParams.get("error");
  if (supabaseErr) {
    redirect(`/auth/error?error=${encodeURIComponent(supabaseErr)}`);
  }

  const supabase = await createClient();

  // ── PKCE flow (default for @supabase/ssr) ────────────────────────────────
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (data.user) {
        // Use the user's own client so "others" correctly preserves this session.
        // Admin signOut("others") has no concept of "current session" and can
        // inadvertently revoke the session we just created.
        await supabase.auth.signOut({ scope: "others" });
        await ensureUserProfile(data.user.id, data.user.user_metadata ?? {});
      }
      redirect(next);
    }

    // Verifier missing = link opened in a different browser than the sign-up
    if (error.message.toLowerCase().includes("verifier")) {
      redirect(`/auth/error?error=${encodeURIComponent("Please open this link in the same browser you used to sign up. If the problem persists, request a new verification email.")}`);
    }

    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  // ── OTP / token_hash flow (legacy) ───────────────────────────────────────
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });

    if (!error) {
      if (data.user) {
        await supabase.auth.signOut({ scope: "others" });
        await ensureUserProfile(data.user.id, data.user.user_metadata ?? {});
      }
      redirect(next);
    }

    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  // No recognisable params — hash-fragment errors handled by the client page
  redirect("/auth/confirm/expired");
}
