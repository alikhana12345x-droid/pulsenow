import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, wallets } from "@/lib/supabase/schema";

async function generateUniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    const [taken] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.referral_code, code))
      .limit(1);
    if (!taken) return code;
  }
  return randomBytes(6).toString("hex").toUpperCase();
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * OAuth providers hand us a real name and avatar in `user_metadata` — Google
 * uses `full_name`/`name` and `picture`. Seeding these means a Google user has
 * a `display_name` from the start and never hits the onboarding gate that
 * email/password signups need.
 */
function identityFromMetadata(userMetadata: Record<string, unknown>) {
  return {
    displayName: firstString(
      userMetadata.full_name,
      userMetadata.name,
      userMetadata.preferred_username,
    )?.slice(0, 40),
    avatarUrl: firstString(userMetadata.avatar_url, userMetadata.picture),
  };
}

export async function ensureUserProfile(
  userId: string,
  userMetadata: Record<string, unknown> = {}
) {
  const [existing] = await db
    .select({ id: profiles.id, display_name: profiles.display_name })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  const { displayName, avatarUrl } = identityFromMetadata(userMetadata);

  if (existing) {
    // Backfill for accounts created before we read the provider identity, and
    // for users who linked Google to an existing email/password account.
    if (!existing.display_name && displayName) {
      await db
        .update(profiles)
        .set({
          display_name: displayName,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          updated_at: new Date(),
        })
        .where(eq(profiles.id, userId));
    }
    return;
  }

  let referredBy: string | undefined;
  // Codes are generated as uppercase hex, so normalise what the user typed —
  // otherwise a lowercase code silently resolves to no referrer.
  const referredByCode = firstString(userMetadata.referred_by_code)?.toUpperCase();
  if (referredByCode) {
    const [referrer] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.referral_code, referredByCode))
      .limit(1);
    referredBy = referrer?.id;
  }

  const referralCode = await generateUniqueReferralCode();
  // Derive a default username from the user's UUID — unique by construction.
  const defaultUsername = `player_${userId.replace(/-/g, "").slice(0, 8)}`;

  // `onConflictDoNothing` keeps this idempotent under concurrency: OAuth
  // callbacks can fire twice (provider retry, user refreshing the callback URL)
  // and a duplicate-key error here would otherwise fail an otherwise valid
  // sign-in.
  await db.transaction(async (tx) => {
    await tx
      .insert(profiles)
      .values({
        id: userId,
        username: defaultUsername,
        referral_code: referralCode,
        ...(displayName ? { display_name: displayName } : {}),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        ...(referredBy ? { referred_by: referredBy } : {}),
      })
      .onConflictDoNothing({ target: profiles.id });
    await tx
      .insert(wallets)
      .values({
        user_id: userId,
        currency: "PKR",
      })
      .onConflictDoNothing({ target: [wallets.user_id, wallets.currency] });
  });
}
