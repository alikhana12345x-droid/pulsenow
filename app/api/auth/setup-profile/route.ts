import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await ensureUserProfile(user.id, user.user_metadata ?? {});
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/setup-profile]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
