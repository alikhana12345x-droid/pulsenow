import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { generateUniqueRandomIdentity } from "@/lib/auth/random-name";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { displayName, username, skip } = await req.json();

    if (!skip && !displayName?.trim()) {
      return NextResponse.json({ error: "Display name is required." }, { status: 400 });
    }

    // Guarantee a profile row exists before updating it.
    // Without this, the UPDATE below is a silent no-op for users who reached
    // onboarding without going through the confirm/callback route (e.g. a
    // re-login after an expired email link).
    await ensureUserProfile(user.id, user.user_metadata ?? {});

    // "Skip for now" — the proxy gate requires a display_name, so a skipped
    // profile still needs one. Generate a throwaway identity server-side; the
    // user can rename themselves later from the profile page.
    if (skip) {
      const identity = await generateUniqueRandomIdentity();

      await db
        .update(profiles)
        .set({
          display_name: identity.displayName,
          ...(identity.username ? { username: identity.username } : {}),
          updated_at: new Date(),
        })
        .where(eq(profiles.id, user.id));

      return NextResponse.json({ ok: true, ...identity });
    }

    // Check username uniqueness if provided
    if (username?.trim()) {
      const [taken] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.username, username.trim().toLowerCase()))
        .limit(1);

      if (taken && taken.id !== user.id) {
        return NextResponse.json({ error: "That username is already taken. Try another." }, { status: 409 });
      }
    }

    await db
      .update(profiles)
      .set({
        display_name: displayName.trim(),
        ...(username?.trim() ? { username: username.trim().toLowerCase() } : {}),
        updated_at: new Date(),
      })
      .where(eq(profiles.id, user.id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/onboarding]", err);
    return NextResponse.json({ error: "Failed to save profile." }, { status: 500 });
  }
}
