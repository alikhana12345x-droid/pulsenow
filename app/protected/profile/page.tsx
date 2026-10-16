import { count, desc, eq, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { bets, profiles, referrals, wallets } from "@/lib/supabase/schema";
import { signOut } from "@/lib/actions/profile";
import ProfileClient from "./profile-client";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string }>;
}) {
  const { panel: panelParam } = await searchParams;
  const defaultPanel = (panelParam === "records" || panelParam === "profile" || panelParam === "invite")
    ? panelParam
    : undefined;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return null;

  // Auth email comes from the JWT — never needs a DB round-trip.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Use allSettled so a single DB hiccup (e.g. EMAXCONN) never crashes the
  // whole page — we just render with partial / empty data instead.
  const [profileRes, walletRes, betCountRes, refSummaryRes, recentRefsRes] =
    await Promise.allSettled([
      db
        .select()
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1)
        .then((r) => r[0] ?? null),

      db
        .select()
        .from(wallets)
        .where(eq(wallets.user_id, userId))
        .limit(1)
        .then((r) => r[0] ?? null),

      db
        .select({ c: count() })
        .from(bets)
        .where(eq(bets.user_id, userId))
        .then((r) => Number(r[0]?.c ?? 0)),

      db
        .select({
          referralCount: sql<number>`count(*)`,
          totalEarned: sql<string>`coalesce(sum(${referrals.total_earned}), 0)`,
        })
        .from(referrals)
        .where(eq(referrals.referrer_id, userId))
        .then((r) => r[0] ?? { referralCount: 0, totalEarned: "0" }),

      db
        .select({
          totalEarned: referrals.total_earned,
          status: referrals.status,
          createdAt: referrals.created_at,
        })
        .from(referrals)
        .where(eq(referrals.referrer_id, userId))
        .orderBy(desc(referrals.created_at))
        .limit(5),
    ]);

  // Unwrap settled results with safe fallbacks.
  const profileRow   = profileRes.status    === "fulfilled" ? profileRes.value    : null;
  const walletRow    = walletRes.status     === "fulfilled" ? walletRes.value     : null;
  const betCount     = betCountRes.status   === "fulfilled" ? betCountRes.value   : 0;
  const refSummary   = refSummaryRes.status === "fulfilled" ? refSummaryRes.value : { referralCount: 0, totalEarned: "0" };
  const recentRefs   = recentRefsRes.status === "fulfilled" ? recentRefsRes.value : [];

  // Log any failures server-side so they're visible in the terminal.
  for (const [key, res] of Object.entries({ profileRes, walletRes, betCountRes, refSummaryRes, recentRefsRes })) {
    if (res.status === "rejected") {
      console.error(`[profile/page] ${key} failed:`, res.reason?.message ?? res.reason);
    }
  }

  return (
    <ProfileClient
      profile={{
        id: profileRow?.id,
        username: profileRow?.username ?? undefined,
        display_name: profileRow?.display_name ?? undefined,
        phone: profileRow?.phone ?? undefined,
        email: user?.email ?? undefined,
        avatar_url: profileRow?.avatar_url ?? undefined,
        referral_code: profileRow?.referral_code ?? undefined,
        kyc_status: profileRow?.kyc_status ?? undefined,
        health: profileRow?.health ?? undefined,
        role: profileRow?.role ?? undefined,
        created_at: profileRow?.created_at?.toISOString(),
      }}
      wallet={
        walletRow
          ? {
              balance: Number(walletRow.balance),
              total_deposited: Number(walletRow.total_deposited),
              total_withdrawn: Number(walletRow.total_withdrawn),
              total_wagered: Number(walletRow.total_wagered),
              total_won: Number(walletRow.total_won),
              isLocked: walletRow.is_locked ?? false,
              currency: walletRow.currency ?? "PKR",
            }
          : undefined
      }
      betSummary={{ totalBets: betCount }}
      referralSummary={{
        referralCount: Number(refSummary.referralCount),
        totalEarned: String(refSummary.totalEarned),
      }}
      recentReferrals={recentRefs.map((r) => ({
        totalEarned: String(r.totalEarned),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }))}
      defaultPanel={defaultPanel}
      signOutAction={signOut}
    />
  );
}
