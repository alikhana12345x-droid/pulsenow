import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Direct sign-up with no email OTP. The user is created pre-confirmed via the
// service-role client, so this works regardless of the dashboard's
// "Confirm email" setting. The client then signs in with the same password.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const referredBy =
      typeof body?.referralCode === "string" && body.referralCode.trim()
        ? body.referralCode.trim()
        : null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { referred_by_code: referredBy },
    });

    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please log in instead." },
          { status: 409 },
        );
      }
      console.error("[auth/register]", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/register]", err);
    return NextResponse.json({ error: "Could not create account." }, { status: 500 });
  }
}
