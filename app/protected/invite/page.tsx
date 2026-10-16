import { desc, eq, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles, referrals } from "@/lib/supabase/schema";
import { CopyChip } from "@/components/protected/copy-chip";
import { ProtectedFinanceProvider } from "@/components/protected/finance-drawer-provider";

export default async function InvitePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  const headerStore = await headers();

  if (!userId) return null;

  const [profile, summary, latestReferrals] = await Promise.all([
    db
      .select({
        username: profiles.username,
        displayName: profiles.display_name,
        referralCode: profiles.referral_code,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        totalReferrals: sql<number>`count(*)`,
        totalEarned: sql<string>`coalesce(sum(${referrals.total_earned}), 0)`,
      })
      .from(referrals)
      .where(eq(referrals.referrer_id, userId))
      .then((rows) => rows[0]),
    db
      .select({
        referredId: referrals.referred_id,
        totalEarned: referrals.total_earned,
        status: referrals.status,
        createdAt: referrals.created_at,
      })
      .from(referrals)
      .where(eq(referrals.referrer_id, userId))
      .orderBy(desc(referrals.created_at))
      .limit(5),
  ]);

  const referredIds = latestReferrals.map((item) => item.referredId);
  const referredProfiles = referredIds.length
    ? await db
        .select({ id: profiles.id, username: profiles.username, displayName: profiles.display_name })
        .from(profiles)
        .where(inArray(profiles.id, referredIds))
    : [];

  const referredMap = new Map(referredProfiles.map((item) => [item.id, item]));
  const referralCode = profile?.referralCode ?? "--------";
  const protocol = headerStore.get("x-forwarded-proto") ?? "https";
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
  const inviteLink = `${protocol}://${host}/auth/sign-up?ref=${referralCode}`;

  return (
    <ProtectedFinanceProvider>
    <div className="min-h-screen bg-bp-bg font-bp-ui text-bp-text">
      <div className="mx-auto w-full max-w-[600px] pb-24">

        {/* ── Hero ── */}
        <div className="relative overflow-hidden border-b border-white/[0.06] bg-[radial-gradient(circle_at_top_right,rgba(242,154,11,0.18),transparent_50%),radial-gradient(circle_at_bottom_left,rgba(242,154,11,0.07),transparent_40%)] px-4 pb-6" style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))" }}>
          <p className="text-[10px] font-bold uppercase tracking-[3px] text-bp-accent/80">
            Invite Program
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight">
            Bring players in.
            <br />
            Keep earning.
          </h1>
          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-white/50">
            Share your personal code and earn a 5% lifetime commission from every referral&apos;s activity.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { label: "Commission", value: "5%" },
              { label: "Players", value: String(summary?.totalReferrals ?? 0) },
              { label: "Earned", value: `PKR ${Number(summary?.totalEarned ?? 0).toLocaleString("en-PK")}` },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-2 py-3 text-center"
              >
                <div className="font-bp-mono text-base font-bold text-bp-text">{value}</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-[1.5px] text-white/40">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 px-4 pt-5">

          {/* ── Referral code ── */}
          <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-bp-mid">
            <div className="px-4 pb-3 pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[2.5px] text-white/40">
                Your Referral Code
              </p>
              <div className="mt-1.5 flex items-end justify-between gap-3">
                <p className="font-bp-mono text-3xl font-black tracking-[0.2em] text-bp-accent">
                  {referralCode}
                </p>
                <p className="mb-1 text-[11px] text-white/30">
                  {profile?.displayName ?? profile?.username ?? "Player"}
                </p>
              </div>
            </div>

            <div className="space-y-2 border-t border-white/[0.05] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 truncate rounded-2xl border border-white/[0.06] bg-black/30 px-3 py-2.5 font-bp-mono text-sm text-white/60">
                  {referralCode}
                </div>
                <CopyChip value={referralCode} label="Copy code" />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 truncate rounded-2xl border border-white/[0.06] bg-black/30 px-3 py-2.5 text-xs text-white/35">
                  {inviteLink}
                </div>
                <CopyChip value={inviteLink} label="Copy link" />
              </div>
            </div>
          </div>

          {/* ── How it works ── */}
          <div className="rounded-3xl border border-white/[0.06] bg-bp-mid p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[2.5px] text-white/40">
              How It Works
            </p>
            <div className="space-y-2.5">
              {[
                { step: "01", title: "Share your code", text: "Send your code or invite link to players you trust." },
                { step: "02", title: "They register", text: "New users sign up using your referral code." },
                { step: "03", title: "You earn automatically", text: "Referral earnings accumulate as eligible activity is settled." },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex gap-3 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-bp-accent/20 bg-bp-accent/10 font-bp-mono text-xs font-black text-bp-accent">
                    {item.step}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-bp-text">{item.title}</p>
                    <p className="mt-0.5 text-xs text-white/40">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Recent referrals ── */}
          <div className="rounded-3xl border border-white/[0.06] bg-bp-mid p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[2.5px] text-white/40">
              Recent Referrals
            </p>

            {latestReferrals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-6 text-center">
                <Users className="mx-auto mb-2 h-6 w-6 text-white/20" />
                <p className="text-sm text-white/30">No referrals yet</p>
                <p className="mt-0.5 text-xs text-white/20">
                  Start sharing your code to unlock commission earnings
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {latestReferrals.map((item) => {
                  const ref = referredMap.get(item.referredId);
                  const name = ref?.displayName ?? ref?.username ?? "New player";
                  return (
                    <div
                      key={item.referredId}
                      className="flex items-center justify-between rounded-2xl border border-white/[0.04] bg-white/[0.02] px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-bp-text">{name}</p>
                        <p className="mt-0.5 text-[10px] text-white/35">
                          Joined {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bp-mono text-sm font-bold text-bp-accent">
                          PKR {Number(item.totalEarned).toLocaleString("en-PK")}
                        </p>
                        <p className="mt-0.5 text-[9px] uppercase tracking-[1.5px] text-white/35">
                          {item.status}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
    </ProtectedFinanceProvider>
  );
}
