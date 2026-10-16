"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { admin_audit_log } from "@/lib/supabase/schema";
import { verifyCapability } from "@/lib/auth/permissions";
import { RESET_CONFIRMATION, type ResetSummary } from "@/lib/platform-reset";

// A fixed literal rather than a bound parameter — the roles are a constant, so
// there is nothing to inject, and it keeps the generated SQL obvious.
const IS_STAFF = sql`role IN ('admin', 'superadmin')`;

/**
 * Wipe the platform back to a clean install while keeping staff able to log in.
 *
 * Deleted: every player account (database row *and* Supabase login) plus all
 * gameplay and money history — bets, rounds, deposits, withdrawals, wallet
 * ledger, referrals, promo grants, and the admin audit log.
 *
 * Kept: admin/superadmin accounts, the games catalogue, payment accounts, bet
 * tiers and platform settings, so the app is usable the moment this finishes.
 *
 * Staff wallets survive but are zeroed: their ledger rows are gone, so leaving
 * a balance behind would be a number with nothing backing it.
 *
 * Irreversible. There is no backup taken here — take one first if the data
 * matters.
 */
export async function resetPlatformData(confirmation: string): Promise<ResetSummary> {
  const admin = await verifyCapability("reset_platform_data");

  if (confirmation !== RESET_CONFIRMATION) {
    throw new Error(`Type "${RESET_CONFIRMATION}" exactly to confirm.`);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Refuse up front rather than half-way: deleting profiles without deleting
  // logins would let a player sign back in and be handed a fresh empty profile
  // by ensureUserProfile, which looks like the reset silently failed.
  if (!serviceKey || !supabaseUrl) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL are required to remove player logins. Nothing was deleted."
    );
  }

  // Staff survive; everyone else goes. Collected before the delete so the auth
  // sweep afterwards knows which logins to keep.
  const staffRows = await db.execute<{ id: string }>(sql`
    SELECT id::text AS id FROM profiles WHERE ${IS_STAFF}
  `);
  const staffIds = new Set(Array.from(staffRows).map((r) => r.id));

  const countRows = await db.execute<Record<string, string>>(sql`
    SELECT
      (SELECT COUNT(*) FROM profiles WHERE NOT (${IS_STAFF}))::text AS players,
      (SELECT COUNT(*) FROM bets)::text              AS bets,
      (SELECT COUNT(*) FROM game_rounds)::text       AS rounds,
      (SELECT COUNT(*) FROM deposits)::text          AS deposits,
      (SELECT COUNT(*) FROM withdrawals)::text       AS withdrawals,
      (SELECT COUNT(*) FROM house_payouts)::text     AS house_payouts,
      (SELECT COUNT(*) FROM transactions)::text      AS transactions,
      (SELECT COUNT(*) FROM referrals)::text         AS referrals,
      (SELECT COUNT(*) FROM promotion_players)::text AS promotion_grants,
      (SELECT COUNT(*) FROM admin_audit_log)::text   AS audit_entries
  `);
  const c = Array.from(countRows)[0] ?? {};

  // One transaction: either the whole platform resets or nothing does.
  await db.transaction(async (tx) => {
    // Children first — every one of these is reachable from a player row.
    await tx.execute(sql`DELETE FROM referral_earnings`);
    await tx.execute(sql`DELETE FROM referrals`);
    await tx.execute(sql`DELETE FROM promotion_players`);
    await tx.execute(sql`DELETE FROM bets`);
    await tx.execute(sql`DELETE FROM game_rounds`);
    await tx.execute(sql`DELETE FROM transactions`);
    await tx.execute(sql`DELETE FROM deposits`);
    await tx.execute(sql`DELETE FROM withdrawals`);
    // House payouts are money the operator sent out through the gateway. Its
    // requested_by is NOT NULL and points at a profile, so it has to go before
    // profiles do.
    await tx.execute(sql`DELETE FROM house_payouts`);

    // profiles.referred_by is a self-reference: a surviving staff row pointing
    // at a deleted player would violate the FK.
    await tx.execute(sql`UPDATE profiles SET referred_by = NULL`);

    // Promotions are kept as config, but created_by points at a profile. Normally
    // that is a staff member who survives; it would only dangle if the creator
    // had since been demoted to player. Nulling it keeps the FK satisfied.
    await tx.execute(sql`
      UPDATE promotions SET created_by = NULL
      WHERE created_by IS NOT NULL
        AND created_by NOT IN (SELECT id FROM profiles WHERE ${IS_STAFF})
    `);

    await tx.execute(sql`
      DELETE FROM wallets
      WHERE user_id IN (SELECT id FROM profiles WHERE NOT (${IS_STAFF}))
    `);
    await tx.execute(sql`DELETE FROM profiles WHERE NOT (${IS_STAFF})`);

    // The staff ledger was just deleted, so their balances have nothing behind
    // them any more.
    await tx.execute(sql`
      UPDATE wallets
      SET balance = 0, total_deposited = 0, total_withdrawn = 0,
          total_wagered = 0, total_won = 0, updated_at = now()
    `);

    await tx.execute(sql`DELETE FROM admin_audit_log`);
  });

  // Remove the logins. Anything that is not a surviving staff account goes,
  // which also sweeps up auth users that never had a profile row.
  const supabase = createAdminClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let authUsersDeleted = 0;
  const authUsersFailed: string[] = [];

  // Enumerate the full list first. Deleting while paging would shift rows
  // between pages and silently skip accounts.
  const PER_PAGE = 200;
  const doomed: { id: string; email?: string }[] = [];

  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      authUsersFailed.push(`listUsers page ${page}: ${error.message}`);
      break;
    }
    for (const user of data.users) {
      if (!staffIds.has(user.id)) doomed.push({ id: user.id, email: user.email });
    }
    if (data.users.length < PER_PAGE) break;
  }

  for (const user of doomed) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
    if (delErr) authUsersFailed.push(`${user.email ?? user.id}: ${delErr.message}`);
    else authUsersDeleted++;
  }

  const summary: ResetSummary = {
    players: Number(c.players ?? 0),
    bets: Number(c.bets ?? 0),
    rounds: Number(c.rounds ?? 0),
    deposits: Number(c.deposits ?? 0),
    withdrawals: Number(c.withdrawals ?? 0),
    housePayouts: Number(c.house_payouts ?? 0),
    transactions: Number(c.transactions ?? 0),
    referrals: Number(c.referrals ?? 0),
    promotionGrants: Number(c.promotion_grants ?? 0),
    auditEntries: Number(c.audit_entries ?? 0),
    authUsersDeleted,
    authUsersFailed,
  };

  // First entry in the freshly-cleared log: who wiped what, and when.
  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "reset_platform_data",
    target_type: "platform",
    target_id: admin.id,
    details: summary,
  });

  revalidatePath("/admin", "layout");
  revalidatePath("/protected", "layout");

  return summary;
}
