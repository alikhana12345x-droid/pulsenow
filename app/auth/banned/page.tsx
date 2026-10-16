import { createClient } from "@/lib/supabase/server";
import { AuthPageShell } from "@/components/auth-page-shell";
import { ShieldX } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/db";
import { profiles } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";

export default async function BannedPage() {
  let banReason: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const [profile] = await db
        .select({ ban_reason: profiles.ban_reason })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);
      banReason = profile?.ban_reason ?? null;
    }
  } catch { /* ignore */ }

  return (
    <AuthPageShell
      eyebrow="Account Suspended"
      title="Access denied."
      description="Your account has been suspended by our team."
      stats={[["Suspend", "ed"], ["Contact", "Support"], ["Appeal", "Possible"]]}
      feed={["Account flagged", "Access blocked", "Support available"]}
      actionHref="/auth/login"
      actionLabel="Login"
    >
      <div className="overflow-hidden rounded-[22px] border border-bp-lose/20 bg-bp-mid/80 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_54px_rgba(255,93,115,0.12)] backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-bp-lose via-bp-accent to-sky-400" />
        <div className="p-6 space-y-5">

          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-bp-lose/20 bg-bp-lose/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-bp-lose shadow-[0_0_12px_rgba(255,93,115,0.8)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-bp-lose">Suspended</span>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-bp-lose/30 bg-bp-lose/15 text-bp-lose">
              <ShieldX className="h-5 w-5" />
            </span>
          </div>

          <div>
            <h2 className="text-[26px] font-black leading-none tracking-tight text-bp-text">Account suspended</h2>
            <p className="mt-2 text-sm text-white/50 leading-relaxed">
              Your account has been suspended and you cannot access the platform at this time.
            </p>
          </div>

          {banReason && (
            <div className="rounded-[10px] border border-bp-lose/20 px-4 py-3 text-sm text-white/60 leading-relaxed"
              style={{ background: "rgba(255,93,115,0.07)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-bp-lose/70 mb-1">Reason</p>
              {banReason}
            </div>
          )}

          <div className="rounded-[12px] border border-white/[0.06] p-4 space-y-2"
            style={{ background: "rgba(255,255,255,0.02)" }}>
            <p className="text-xs font-bold text-bp-text">Think this is a mistake?</p>
            <p className="text-[11px] text-white/40 leading-relaxed">
              Contact our support team to appeal this decision. Include your registered email and account details.
            </p>
          </div>

          <form action="/auth/sign-out" method="POST">
            <button
              type="submit"
              className="w-full h-11 rounded-[12px] border border-white/[0.08] text-sm font-semibold text-white/50 hover:text-white/80 transition-colors"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              Sign out
            </button>
          </form>

        </div>
      </div>
    </AuthPageShell>
  );
}
