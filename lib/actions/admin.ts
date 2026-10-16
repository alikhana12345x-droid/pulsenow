"use server";

import { db } from "@/lib/db";
import {
  profiles,
  wallets,
  transactions,
  deposits,
  withdrawals,
  referrals,
  referral_earnings,
  admin_audit_log,
  payment_accounts,
  bets,
  game_rounds,
} from "@/lib/supabase/schema";
import { and, eq, desc, count, sum, ilike, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { revalidatePath } from "next/cache";
import { creditWallet } from "./wallet";
import { refundWithdrawal, settleWithdrawalSuccess } from "@/lib/finance/settlement";
import {
  verifyAdmin,
  verifyCapability,
  type Actor,
} from "@/lib/auth/permissions";
import { can, isAdminRole, isSuperadmin, type Role } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDeposit } from "@/lib/notifications/discord";

const actorLabel = (actor: Actor) => (actor.username ? `@${actor.username}` : actor.id.slice(0, 8));

const ASSIGNABLE_ROLES: Role[] = ["player", "admin", "superadmin"];

/**
 * Load the profile an admin action is about to act on, and refuse the ones the
 * caller has no business touching: an `admin` may only manage players, so staff
 * accounts are invisible *and* untouchable to them.
 */
async function loadTarget(actor: Actor, userId: string) {
  const [target] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      username: profiles.username,
      health: profiles.health,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!target) throw new Error("User not found");

  if (!isSuperadmin(actor.role) && isAdminRole(target.role)) {
    throw new Error("Forbidden: only a superadmin can manage staff accounts");
  }
  return target;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getAdminDashboardStats() {
  const actor = await verifyAdmin();
  const fallbackCount = [{ count: 0 }];
  const fallbackSum = [{ total: "0" }];

  const [activeAccounts, pendingDeposits, failedWithdrawals, totalUsers] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(payment_accounts)
        .where(eq(payment_accounts.is_active, true))
        .catch(() => fallbackCount),
      db
        .select({ count: count() })
        .from(deposits)
        .where(eq(deposits.status, "pending"))
        .catch(() => fallbackCount),
      db
        .select({ count: count() })
        .from(withdrawals)
        .where(eq(withdrawals.status, "failed"))
        .catch(() => fallbackCount),
      db.select({ count: count() }).from(profiles).catch(() => fallbackCount),
    ]);

  const [bannedUsers, totalReferrals, wageredResult, wonResult] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(profiles)
        .where(eq(profiles.is_banned, true))
        .catch(() => fallbackCount),
      db.select({ count: count() }).from(referrals).catch(() => fallbackCount),
      db
        .select({ total: sum(wallets.total_wagered) })
        .from(wallets)
        .catch(() => fallbackSum),
      db
        .select({ total: sum(wallets.total_won) })
        .from(wallets)
        .catch(() => fallbackSum),
    ]);

  // Money movement and live exposure. These reuse the Reports definitions
  // verbatim — deposits count when `confirmed`, withdrawals when `completed`,
  // liability is Σ wallet balances — so the dashboard and the Reports section
  // can never quote different numbers for the same thing. Unlike Reports these
  // are all-time rather than date-ranged.
  const [depositTotal, withdrawalTotal, liabilityTotal, pendingWithdrawals] =
    await Promise.all([
      db
        .select({
          total: sql<string>`COALESCE(SUM(${deposits.amount}) FILTER (WHERE ${deposits.status} = 'confirmed'), 0)`,
        })
        .from(deposits)
        .catch(() => fallbackSum),
      db
        .select({
          total: sql<string>`COALESCE(SUM(${withdrawals.amount}) FILTER (WHERE ${withdrawals.status} = 'completed'), 0)`,
        })
        .from(withdrawals)
        .catch(() => fallbackSum),
      db
        .select({ total: sql<string>`COALESCE(SUM(${wallets.balance}), 0)` })
        .from(wallets)
        .catch(() => fallbackSum),
      db
        .select({ count: count() })
        .from(withdrawals)
        .where(eq(withdrawals.status, "pending"))
        .catch(() => fallbackCount),
    ]);

  const totalWagered = Number(wageredResult[0]?.total ?? 0);
  const totalWon = Number(wonResult[0]?.total ?? 0);
  const totalDeposits = Number(depositTotal[0]?.total ?? 0);
  const totalWithdrawals = Number(withdrawalTotal[0]?.total ?? 0);

  return {
    viewerRole: actor.role,
    totalUsers: totalUsers[0].count,
    bannedUsers: bannedUsers[0].count,
    totalReferrals: totalReferrals[0].count,
    pendingDeposits: pendingDeposits[0].count,
    pendingWithdrawals: pendingWithdrawals[0].count,
    failedWithdrawals: failedWithdrawals[0].count,
    activeAccounts: activeAccounts[0].count,
    totalDeposits,
    totalWithdrawals,
    netCashFlow: totalDeposits - totalWithdrawals,
    pendingLiability: Number(liabilityTotal[0]?.total ?? 0),
    ggr: totalWagered - totalWon,
  };
}

// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * Users visible to the caller. A superadmin sees every account including staff;
 * an admin sees players only, so admins and superadmins are neither listed nor
 * addressable from the table.
 */
export async function getAdminUsers() {
  const actor = await verifyAdmin();
  const seesStaff = can(actor.role, "view_staff_accounts");

  const users = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      display_name: profiles.display_name,
      avatar_url: profiles.avatar_url,
      phone: profiles.phone,
      role: profiles.role,
      is_banned: profiles.is_banned,
      ban_reason: profiles.ban_reason,
      kyc_status: profiles.kyc_status,
      health: profiles.health,
      withdrawals_held: profiles.withdrawals_held,
      referral_code: profiles.referral_code,
      created_at: profiles.created_at,
      balance: wallets.balance,
      currency: wallets.currency,
      total_deposited: wallets.total_deposited,
      total_withdrawn: wallets.total_withdrawn,
      total_wagered: wallets.total_wagered,
    })
    .from(profiles)
    .leftJoin(wallets, eq(wallets.user_id, profiles.id))
    .where(seesStaff ? undefined : notInArray(profiles.role, ["admin", "superadmin"]))
    .orderBy(desc(profiles.created_at))
    .limit(200);

  // Login emails come from auth.users, which drizzle does not map.
  const emailById = await loadAuthEmails();

  return {
    viewerId: actor.id,
    viewerRole: actor.role,
    users: users.map((u) => ({ ...u, email: emailById.get(u.id) ?? null })),
  };
}

export async function banUser(userId: string, reason: string) {
  const admin = await verifyCapability("ban_user");
  const target = await loadTarget(admin, userId);
  if (target.id === admin.id) throw new Error("You cannot ban your own account");

  await db
    .update(profiles)
    .set({ is_banned: true, ban_reason: reason, updated_at: new Date() })
    .where(eq(profiles.id, userId));
  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "ban_user",
    target_type: "profile",
    target_id: userId,
    details: { reason },
  });
  revalidatePath("/admin/users");
}

export async function unbanUser(userId: string) {
  const admin = await verifyCapability("ban_user");
  await loadTarget(admin, userId);

  await db
    .update(profiles)
    .set({ is_banned: false, ban_reason: null, updated_at: new Date() })
    .where(eq(profiles.id, userId));
  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "unban_user",
    target_type: "profile",
    target_id: userId,
    details: {},
  });
  revalidatePath("/admin/users");
}

export async function changeUserRole(userId: string, role: string) {
  const admin = await verifyCapability("change_user_role");

  if (!ASSIGNABLE_ROLES.includes(role as Role)) {
    throw new Error(`Invalid role: ${role}`);
  }
  // Demoting yourself would drop you out of the admin area mid-session, with no
  // way back in unless another superadmin exists to undo it.
  if (userId === admin.id) throw new Error("You cannot change your own role");

  const target = await loadTarget(admin, userId);
  if (target.role === role) return;

  await db
    .update(profiles)
    .set({ role, updated_at: new Date() })
    .where(eq(profiles.id, userId));
  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "change_role",
    target_type: "profile",
    target_id: userId,
    details: { from: target.role, to: role },
  });
  revalidatePath("/admin/users");
}

export async function setPlayerHealth(userId: string, health: number) {
  const admin = await verifyCapability("set_player_health");

  if (!Number.isInteger(health) || health < 0 || health > 100) {
    throw new Error("Health must be a whole number from 0 to 100");
  }

  const target = await loadTarget(admin, userId);
  // Staff accounts never play, so health only means something on a player.
  if (target.role !== "player") throw new Error("Health only applies to player accounts");
  if (target.health === health) return;

  await db
    .update(profiles)
    .set({ health, updated_at: new Date() })
    .where(eq(profiles.id, userId));
  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "set_health",
    target_type: "profile",
    target_id: userId,
    details: { from: target.health, to: health },
  });
  revalidatePath("/admin/users");
}

/**
 * Put a player's withdrawals on hold, or lift the hold. While held, each
 * withdrawal they request is recorded and their balance reserved exactly as
 * usual, but it is never sent to the gateway: it waits on the Finance desk
 * until an admin pays it by hand or rejects it (which refunds it). Lifting the
 * hold only affects new requests — held ones stay on the desk.
 */
export async function setWithdrawalHold(userId: string, held: boolean, note: string) {
  const admin = await verifyCapability("hold_withdrawals");
  const target = await loadTarget(admin, userId);
  if (target.role !== "player") throw new Error("Withdrawal holds only apply to player accounts");

  const reason = note.trim();
  if (held && !reason) throw new Error("Add a note saying why the withdrawals are held");

  await db
    .update(profiles)
    .set({ withdrawals_held: held, updated_at: new Date() })
    .where(eq(profiles.id, userId));
  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: held ? "hold_withdrawals" : "release_withdrawals",
    target_type: "profile",
    target_id: userId,
    details: { note: reason || null },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/audit");
}

export async function adminAdjustBalance(
  userId: string,
  amount: number,
  reason: string
) {
  const admin = await verifyCapability("adjust_balance");
  await loadTarget(admin, userId);

  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.user_id, userId))
    .limit(1);

  if (!wallet) throw new Error("Wallet not found");

  const newBalance = Number(wallet.balance) + amount;
  if (newBalance < 0) throw new Error("Adjustment would result in negative balance");

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({ balance: String(newBalance), updated_at: new Date() })
      .where(eq(wallets.id, wallet.id));

    await tx.insert(transactions).values({
      wallet_id: wallet.id,
      type: amount >= 0 ? "admin_credit" : "admin_debit",
      amount: String(Math.abs(amount)),
      balance_before: wallet.balance,
      balance_after: String(newBalance),
      reference_type: "admin_adjustment",
      reference_id: admin.id,
      description: reason,
    });
  });

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "adjust_balance",
    target_type: "wallet",
    target_id: wallet.id,
    details: { amount, reason, new_balance: newBalance },
  });

  revalidatePath("/admin/users");
}

// ─── Deposits ─────────────────────────────────────────────────────────────────

export async function getAdminDeposits(status?: string) {
  await verifyCapability("manage_deposits");
  const query = db
    .select({
      id: deposits.id,
      user_id: deposits.user_id,
      username: profiles.username,
      amount: deposits.amount,
      currency: deposits.currency,
      status: deposits.status,
      gateway_ref: deposits.gateway_ref,
      proof_url: deposits.proof_url,
      wallet_id: deposits.wallet_id,
      payment_account_id: deposits.payment_account_id,
      created_at: deposits.created_at,
      confirmed_at: deposits.confirmed_at,
    })
    .from(deposits)
    .leftJoin(profiles, eq(profiles.id, deposits.user_id))
    .orderBy(desc(deposits.created_at))
    .limit(200);

  if (status) {
    return db
      .select({
        id: deposits.id,
        user_id: deposits.user_id,
        username: profiles.username,
        amount: deposits.amount,
        currency: deposits.currency,
        status: deposits.status,
        gateway_ref: deposits.gateway_ref,
        proof_url: deposits.proof_url,
        wallet_id: deposits.wallet_id,
        payment_account_id: deposits.payment_account_id,
        created_at: deposits.created_at,
        confirmed_at: deposits.confirmed_at,
      })
      .from(deposits)
      .leftJoin(profiles, eq(profiles.id, deposits.user_id))
      .where(eq(deposits.status, status))
      .orderBy(desc(deposits.created_at))
      .limit(200);
  }

  return query;
}

/**
 * Money tables only carry a `user_id`, which tells an admin nothing at a glance.
 * Hydrate each row with the identity fields the shared <UserIdentity> cell needs
 * — one extra query per page, regardless of row count. Emails are left out on
 * purpose: they cost an auth API round-trip and the name + handle + id already
 * identify the player here.
 */
async function attachUsernames<T extends { user_id: string }>(rows: T[]) {
  const blank = { username: null, display_name: null, avatar_url: null, phone: null };
  if (rows.length === 0) return rows.map((row) => ({ ...row, ...blank }));

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const profileRows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      display_name: profiles.display_name,
      avatar_url: profiles.avatar_url,
      // The number a payment-status message goes to on WhatsApp.
      phone: profiles.phone,
    })
    .from(profiles)
    .where(inArray(profiles.id, userIds));
  const profileById = new Map(profileRows.map((row) => [row.id, row]));

  return rows.map((row) => {
    const p = profileById.get(row.user_id);
    return {
      ...row,
      username: p?.username ?? null,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      phone: p?.phone ?? null,
    };
  });
}

// ─── List search ──────────────────────────────────────────────────────────────

/**
 * Tidy a search-box value: trimmed, a leading @ dropped (handles are stored
 * bare), and the WD- / DP- prefix of a shared payment reference dropped so the
 * rest matches the record id.
 */
function searchTerm(q: string | undefined) {
  return (q ?? "").trim().replace(/^@/, "").replace(/^(wd|dp)-/i, "");
}

/** `%term%` for ILIKE, with the admin's own % and _ taken literally. */
function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const AMOUNT_TERM = /^\d+(\.\d{1,2})?$/;

function allOf(conds: (SQL | undefined)[]) {
  const present = conds.filter((c): c is SQL => !!c);
  return present.length ? and(...present) : undefined;
}

/**
 * Emails live in `auth.users`, not in `profiles`, so they need the service-role
 * client. Anything short of a clean response degrades to "no email" rather than
 * breaking the page — the admin tables are useful without it.
 */
async function loadAuthEmails(): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return byId;
  }
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email) byId.set(user.id, user.email);
    }
  } catch (err) {
    console.error("[admin] could not load auth emails:", err);
  }
  return byId;
}

/** Deposit filter pills. "declined" covers both ways a deposit ends unpaid. */
export type DepositFilter = "pending" | "confirmed" | "declined";

function depositWhere(status: DepositFilter | undefined, q: string | undefined) {
  const term = searchTerm(q);
  let search: SQL | undefined;
  if (term) {
    const pat = likePattern(term);
    search = or(
      ilike(profiles.username, pat),
      ilike(profiles.display_name, pat),
      ilike(profiles.phone, pat),
      sql`${deposits.id}::text ilike ${pat}`,
      ilike(deposits.gateway_ref, pat),
      ilike(payment_accounts.label, pat),
      // The TID / sending number the player typed on a manual deposit.
      sql`${deposits.metadata}->>'sender_ref' ilike ${pat}`,
      AMOUNT_TERM.test(term) ? eq(deposits.amount, term) : undefined
    );
  }

  return allOf([
    status === "declined"
      ? inArray(deposits.status, ["cancelled", "failed"])
      : status
        ? eq(deposits.status, status)
        : undefined,
    search,
  ]);
}

/** Totals behind each filter pill — for the whole table, not the current search. */
async function depositCounts() {
  const rows = await db
    .select({ status: deposits.status, count: count() })
    .from(deposits)
    .groupBy(deposits.status);
  const of = (status: string) => rows.find((r) => r.status === status)?.count ?? 0;

  return {
    all: rows.reduce((n, r) => n + r.count, 0),
    pending: of("pending"),
    confirmed: of("confirmed"),
    declined: of("cancelled") + of("failed"),
  };
}

export async function getAdminDepositsPage({
  page = 1,
  pageSize = 10,
  status,
  q,
}: {
  page?: number;
  pageSize?: number;
  status?: DepositFilter;
  q?: string;
}) {
  await verifyCapability("manage_deposits");
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  const offset = (safePage - 1) * safePageSize;
  const where = depositWhere(status, q);

  // proof_url is intentionally excluded — screenshots are base64 blobs, fetched
  // on demand via getDepositProof so the list query stays lean. The account
  // label/gateway tells the admin which account should have received the money.
  const baseSelect = {
    id: deposits.id,
    user_id: deposits.user_id,
    amount: deposits.amount,
    currency: deposits.currency,
    status: deposits.status,
    gateway_ref: deposits.gateway_ref,
    wallet_id: deposits.wallet_id,
    payment_account_id: deposits.payment_account_id,
    account_label: payment_accounts.label,
    gateway: payment_accounts.gateway,
    created_at: deposits.created_at,
    confirmed_at: deposits.confirmed_at,
  };

  // The profile join is only there for searching by player; identities are
  // attached afterwards in one query for the whole page.
  const [rows, totalRows, counts] = await Promise.all([
    db
      .select(baseSelect)
      .from(deposits)
      .leftJoin(payment_accounts, eq(payment_accounts.id, deposits.payment_account_id))
      .leftJoin(profiles, eq(profiles.id, deposits.user_id))
      .where(where)
      .orderBy(desc(deposits.created_at))
      .limit(safePageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(deposits)
      .leftJoin(payment_accounts, eq(payment_accounts.id, deposits.payment_account_id))
      .leftJoin(profiles, eq(profiles.id, deposits.user_id))
      .where(where),
    depositCounts(),
  ]);
  const rowsWithUsernames = await attachUsernames(rows);

  const total = totalRows[0]?.count ?? 0;

  return {
    rows: rowsWithUsernames,
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    counts,
  };
}

export async function getAdminDepositsSummary() {
  await verifyCapability("manage_deposits");
  return depositCounts();
}

/** Fetch a single deposit's payment screenshot + metadata on demand (admin-only). */
export async function getDepositProof(depositId: string) {
  await verifyCapability("manage_deposits");
  const [row] = await db
    .select({
      proof_url: deposits.proof_url,
      metadata:  deposits.metadata,
      amount:    deposits.amount,
      currency:  deposits.currency,
    })
    .from(deposits)
    .where(eq(deposits.id, depositId))
    .limit(1);
  return row ?? null;
}

export async function adminForceCompleteDeposit(depositId: string) {
  const admin = await verifyCapability("manage_deposits");

  const [deposit] = await db
    .select()
    .from(deposits)
    .where(eq(deposits.id, depositId))
    .limit(1);

  if (!deposit) throw new Error("Deposit not found");
  if (deposit.status === "confirmed") throw new Error("Already confirmed");

  await db.transaction(async (tx) => {
    await creditWallet(
      tx,
      deposit.wallet_id,
      Number(deposit.amount),
      "deposit",
      "deposit",
      deposit.id,
      `Deposit force-confirmed by admin`
    );
    await tx
      .update(deposits)
      .set({ status: "confirmed", confirmed_by: admin.id, confirmed_at: new Date() })
      .where(eq(deposits.id, depositId));
  });

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "force_complete_deposit",
    target_type: "deposit",
    target_id: depositId,
    details: { amount: deposit.amount, currency: deposit.currency },
  });
  notifyDeposit(depositId, "deposit_confirmed", { actor: `Approved by ${actorLabel(admin)}` });

  revalidatePath("/admin/finance");
  revalidatePath("/protected", "layout");
}

export async function adminCancelDeposit(depositId: string) {
  const admin = await verifyCapability("manage_deposits");

  await db
    .update(deposits)
    .set({ status: "cancelled" })
    .where(eq(deposits.id, depositId));

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "cancel_deposit",
    target_type: "deposit",
    target_id: depositId,
    details: {},
  });
  notifyDeposit(depositId, "deposit_failed", {
    reason: "Rejected by admin",
    actor: `Rejected by ${actorLabel(admin)}`,
  });

  revalidatePath("/admin/finance");
}

// ─── Withdrawals ──────────────────────────────────────────────────────────────

/**
 * Load a withdrawal an admin is about to settle by hand, refusing one that is
 * still with the gateway: paying or refunding a payout SolidPay may yet deliver
 * is exactly how a player gets paid twice. Those are checked with Sync first.
 */
async function loadManualWithdrawal(withdrawalId: string, verb: "completed" | "rejected") {
  const [withdrawal] = await db
    .select({
      id: withdrawals.id,
      status: withdrawals.status,
      amount: withdrawals.amount,
      currency: withdrawals.currency,
      user_id: withdrawals.user_id,
      metadata: withdrawals.metadata,
    })
    .from(withdrawals)
    .where(eq(withdrawals.id, withdrawalId))
    .limit(1);

  if (!withdrawal) throw new Error("Withdrawal not found");
  if (!["processing", "pending"].includes(withdrawal.status)) {
    throw new Error(`Only pending withdrawals can be ${verb}`);
  }

  const meta = (withdrawal.metadata ?? {}) as { provider?: string; dispatch?: string };
  if (meta.provider === "solidpay" && meta.dispatch !== "manual_review") {
    throw new Error("This payout is still with SolidPay. Use Sync to check it before settling it by hand.");
  }
  return withdrawal;
}

export async function adminCompleteWithdrawal(withdrawalId: string) {
  const admin = await verifyCapability("manage_withdrawals");
  const withdrawal = await loadManualWithdrawal(withdrawalId, "completed");

  // Paid by hand, outside the gateway — kept out of the gateway's paid-out total.
  const result = await settleWithdrawalSuccess(withdrawalId, {
    meta: { paid_manually: true },
    reviewedBy: admin.id,
    actor: `Marked paid by ${actorLabel(admin)}`,
  });
  if (result !== "settled") throw new Error("This withdrawal was already settled");

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "complete_withdrawal",
    target_type: "withdrawal",
    target_id: withdrawalId,
    details: { amount: withdrawal.amount, currency: withdrawal.currency, user_id: withdrawal.user_id },
  });

  revalidatePath("/admin/finance");
  revalidatePath("/admin/audit");
}

export async function adminRejectWithdrawal(withdrawalId: string, reason: string) {
  const admin = await verifyCapability("manage_withdrawals");
  const withdrawal = await loadManualWithdrawal(withdrawalId, "rejected");

  const result = await refundWithdrawal(withdrawalId, reason, {
    reviewedBy: admin.id,
    actor: `Rejected by ${actorLabel(admin)}`,
  });
  if (result !== "settled") throw new Error("This withdrawal was already settled");

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "reject_withdrawal",
    target_type: "withdrawal",
    target_id: withdrawalId,
    details: { amount: withdrawal.amount, currency: withdrawal.currency, user_id: withdrawal.user_id, reason },
  });

  revalidatePath("/admin/finance");
  revalidatePath("/admin/audit");
  revalidatePath("/protected", "layout");
}

export async function getAdminWithdrawals(status?: string) {
  await verifyCapability("manage_withdrawals");
  const base = {
    id: withdrawals.id,
    user_id: withdrawals.user_id,
    username: profiles.username,
    amount: withdrawals.amount,
    currency: withdrawals.currency,
    method: withdrawals.method,
    destination: withdrawals.destination,
    status: withdrawals.status,
    rejection_reason: withdrawals.rejection_reason,
    wallet_id: withdrawals.wallet_id,
    created_at: withdrawals.created_at,
    processed_at: withdrawals.processed_at,
  };

  if (status) {
    return db
      .select(base)
      .from(withdrawals)
      .leftJoin(profiles, eq(profiles.id, withdrawals.user_id))
      .where(eq(withdrawals.status, status))
      .orderBy(desc(withdrawals.created_at))
      .limit(200);
  }

  return db
    .select(base)
    .from(withdrawals)
    .leftJoin(profiles, eq(profiles.id, withdrawals.user_id))
    .orderBy(desc(withdrawals.created_at))
    .limit(200);
}

/**
 * Withdrawal filter pills. "pending" is everything waiting on an admin to pay
 * by hand (manual mode, held players, failed gateway payouts); "processing" is
 * with the gateway; "held" narrows pending to held players.
 */
export type WithdrawalFilter = "pending" | "processing" | "held" | "completed" | "rejected";

const OPEN_WITHDRAWAL_STATUSES = ["pending", "processing"];
const isHeldWithdrawal = sql`${withdrawals.metadata}->>'hold' = 'true'`;

function withdrawalWhere(status: WithdrawalFilter | undefined, q: string | undefined) {
  const term = searchTerm(q);
  let search: SQL | undefined;
  if (term) {
    const pat = likePattern(term);
    search = or(
      ilike(profiles.username, pat),
      ilike(profiles.display_name, pat),
      ilike(profiles.phone, pat),
      // The wallet number the money goes to — usually what a player quotes.
      ilike(withdrawals.destination, pat),
      sql`${withdrawals.id}::text ilike ${pat}`,
      ilike(withdrawals.gateway_ref, pat),
      sql`${withdrawals.metadata}->>'acct_name' ilike ${pat}`,
      AMOUNT_TERM.test(term) ? eq(withdrawals.amount, term) : undefined
    );
  }

  const byStatus =
    status === "held"
      ? and(inArray(withdrawals.status, OPEN_WITHDRAWAL_STATUSES), isHeldWithdrawal)
      : status === "rejected"
        ? inArray(withdrawals.status, ["rejected", "failed"])
        : status
          ? eq(withdrawals.status, status)
          : undefined;

  return allOf([byStatus, search]);
}

/** Totals behind each filter pill — for the whole table, not the current search. */
async function withdrawalCounts() {
  const [rows, [held]] = await Promise.all([
    db
      .select({ status: withdrawals.status, count: count() })
      .from(withdrawals)
      .groupBy(withdrawals.status),
    db
      .select({ count: count() })
      .from(withdrawals)
      .where(and(inArray(withdrawals.status, OPEN_WITHDRAWAL_STATUSES), isHeldWithdrawal)),
  ]);
  const of = (status: string) => rows.find((r) => r.status === status)?.count ?? 0;

  return {
    all: rows.reduce((n, r) => n + r.count, 0),
    pending: of("pending"),
    processing: of("processing"),
    held: held?.count ?? 0,
    completed: of("completed"),
    rejected: of("rejected") + of("failed"),
  };
}

export async function getAdminWithdrawalsPage({
  page = 1,
  pageSize = 10,
  status,
  q,
}: {
  page?: number;
  pageSize?: number;
  status?: WithdrawalFilter;
  q?: string;
}) {
  await verifyCapability("manage_withdrawals");
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  const offset = (safePage - 1) * safePageSize;
  const where = withdrawalWhere(status, q);

  const baseSelect = {
    id: withdrawals.id,
    user_id: withdrawals.user_id,
    amount: withdrawals.amount,
    currency: withdrawals.currency,
    method: withdrawals.method,
    destination: withdrawals.destination,
    status: withdrawals.status,
    rejection_reason: withdrawals.rejection_reason,
    gateway_ref: withdrawals.gateway_ref,
    wallet_id: withdrawals.wallet_id,
    // Tells the desk whether a gateway is carrying this payout (nothing to
    // approve) or it is waiting on an admin to send the money by hand.
    metadata: withdrawals.metadata,
    created_at: withdrawals.created_at,
    processed_at: withdrawals.processed_at,
  };

  // The profile join is only there for searching by player; identities are
  // attached afterwards in one query for the whole page.
  const [rows, totalRows, counts] = await Promise.all([
    db
      .select(baseSelect)
      .from(withdrawals)
      .leftJoin(profiles, eq(profiles.id, withdrawals.user_id))
      .where(where)
      .orderBy(desc(withdrawals.created_at))
      .limit(safePageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(withdrawals)
      .leftJoin(profiles, eq(profiles.id, withdrawals.user_id))
      .where(where),
    withdrawalCounts(),
  ]);
  const rowsWithUsernames = await attachUsernames(rows);

  const total = totalRows[0]?.count ?? 0;

  return {
    rows: rowsWithUsernames,
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    counts,
  };
}

export async function getAdminWithdrawalsSummary() {
  await verifyCapability("manage_withdrawals");
  return withdrawalCounts();
}

// ─── Referrals ────────────────────────────────────────────────────────────────

export async function getAdminReferrals() {
  await verifyCapability("view_referrals");
  const referrer = alias(profiles, "referrer");
  const referred = alias(profiles, "referred");

  return db
    .select({
      id: referrals.id,
      referrer_id: referrals.referrer_id,
      referred_id: referrals.referred_id,
      referrer_username: referrer.username,
      referred_username: referred.username,
      commission_rate: referrals.commission_rate,
      total_earned: referrals.total_earned,
      status: referrals.status,
      created_at: referrals.created_at,
    })
    .from(referrals)
    .leftJoin(referrer, eq(referrer.id, referrals.referrer_id))
    .leftJoin(referred, eq(referred.id, referrals.referred_id))
    .orderBy(desc(referrals.created_at))
    .limit(200);
}

export async function getReferralStats() {
  await verifyCapability("view_referrals");
  const [total, totalEarned, active] = await Promise.all([
    db.select({ count: count() }).from(referrals),
    db.select({ total: sum(referrals.total_earned) }).from(referrals),
    db.select({ count: count() }).from(referrals).where(eq(referrals.status, "active")),
  ]);

  return {
    total: total[0].count,
    totalEarned: Number(totalEarned[0]?.total ?? 0),
    active: active[0].count,
  };
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export type AdminAuditDetails = Record<string, unknown> | null;

export type PlatformAuditRow = {
  id: string;
  admin_id: string;
  admin_username: string | null;
  admin_display_name: string | null;
  admin_avatar_url: string | null;
  admin_role: string | null;
  action: string;
  target_type: string;
  target_id: string;
  target_username: string | null;
  target_display_name: string | null;
  target_avatar_url: string | null;
  details: AdminAuditDetails;
  ip_address: string | null;
  created_at: string;
};

export type PlayerAuditRow = {
  id: string;
  source: "transaction" | "deposit" | "withdrawal" | "bet";
  user_id: string;
  username: string | null;
  display_name: string | null;
  event: string;
  category: string;
  amount: string | null;
  currency: string | null;
  status: string | null;
  reference_type: string | null;
  reference_id: string | null;
  details: AdminAuditDetails;
  created_at: string;
};

function toIso(value: Date | string) {
  return new Date(value).toISOString();
}

function normalizeDetails(value: unknown): AdminAuditDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function getAdminAuditSummary() {
  await verifyCapability("view_audit");
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 2 queries instead of 7 — keeps connection pool headroom for other concurrent requests
  const [auditRows, playerRows] = await Promise.all([
    db.execute<{ platform_total: string; platform_recent: string; balance_adjustments: string }>(sql`
      SELECT
        COUNT(*)::text                                                     AS platform_total,
        COUNT(*) FILTER (WHERE created_at >= ${sinceIso}::timestamptz)::text AS platform_recent,
        COUNT(*) FILTER (WHERE action = 'adjust_balance')::text           AS balance_adjustments
      FROM admin_audit_log
    `),
    db.execute<{ player_total: string }>(sql`
      SELECT (
        (SELECT COUNT(*) FROM transactions) +
        (SELECT COUNT(*) FROM deposits) +
        (SELECT COUNT(*) FROM withdrawals) +
        (SELECT COUNT(*) FROM bets)
      )::text AS player_total
    `),
  ]);

  const a = Array.from(auditRows)[0];
  const p = Array.from(playerRows)[0];

  return {
    platformEvents:       Number(a?.platform_total      ?? 0),
    recentPlatformEvents: Number(a?.platform_recent     ?? 0),
    balanceAdjustments:   Number(a?.balance_adjustments ?? 0),
    playerEvents:         Number(p?.player_total        ?? 0),
  };
}

export async function getPlatformAuditPage({
  page = 1,
  pageSize = 12,
  action,
  q,
}: {
  page?: number;
  pageSize?: number;
  /** One exact action, e.g. "reject_withdrawal". */
  action?: string;
  q?: string;
}) {
  await verifyCapability("view_audit");
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  const offset = (safePage - 1) * safePageSize;
  const admin = alias(profiles, "audit_admin");
  const target = alias(profiles, "audit_target");

  const term = searchTerm(q);
  const pat = likePattern(term);
  const where = allOf([
    action ? eq(admin_audit_log.action, action) : undefined,
    term
      ? or(
          ilike(admin.username, pat),
          ilike(admin.display_name, pat),
          ilike(target.username, pat),
          ilike(target.display_name, pat),
          ilike(admin_audit_log.action, pat),
          ilike(admin_audit_log.target_type, pat),
          sql`${admin_audit_log.target_id}::text ilike ${pat}`,
          ilike(admin_audit_log.ip_address, pat),
          // Notes and reasons admins typed — ban reasons, hold notes, adjustments.
          sql`${admin_audit_log.details}::text ilike ${pat}`
        )
      : undefined,
  ]);

  const [rows, totalRows, actionRows] = await Promise.all([
    db
      .select({
        id: admin_audit_log.id,
        admin_id: admin_audit_log.admin_id,
        admin_username: admin.username,
        admin_display_name: admin.display_name,
        admin_avatar_url: admin.avatar_url,
        admin_role: admin.role,
        action: admin_audit_log.action,
        target_type: admin_audit_log.target_type,
        target_id: admin_audit_log.target_id,
        target_username: target.username,
        target_display_name: target.display_name,
        target_avatar_url: target.avatar_url,
        details: admin_audit_log.details,
        ip_address: admin_audit_log.ip_address,
        created_at: admin_audit_log.created_at,
      })
      .from(admin_audit_log)
      .leftJoin(admin, eq(admin.id, admin_audit_log.admin_id))
      .leftJoin(target, eq(target.id, admin_audit_log.target_id))
      .where(where)
      .orderBy(desc(admin_audit_log.created_at))
      .limit(safePageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(admin_audit_log)
      .leftJoin(admin, eq(admin.id, admin_audit_log.admin_id))
      .leftJoin(target, eq(target.id, admin_audit_log.target_id))
      .where(where),
    // Every action that has ever been logged, busiest first, for the filter.
    db
      .select({ action: admin_audit_log.action, count: count() })
      .from(admin_audit_log)
      .groupBy(admin_audit_log.action)
      .orderBy(desc(count())),
  ]);

  const total = totalRows[0]?.count ?? 0;

  return {
    rows: rows.map((row) => ({
      ...row,
      details: normalizeDetails(row.details),
      created_at: toIso(row.created_at),
    })),
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    actions: actionRows,
  };
}

export type PlayerAuditSource = PlayerAuditRow["source"];

/** Row counts per timeline source — the four tables Player Audit merges. */
async function playerAuditCounts(): Promise<Record<PlayerAuditSource, number>> {
  const result = await db.execute<Record<PlayerAuditSource, string>>(sql`
    SELECT
      (SELECT COUNT(*) FROM transactions)::text AS transaction,
      (SELECT COUNT(*) FROM deposits)::text     AS deposit,
      (SELECT COUNT(*) FROM withdrawals)::text  AS withdrawal,
      (SELECT COUNT(*) FROM bets)::text         AS bet
  `);
  const row = Array.from(result)[0];
  return {
    transaction: Number(row?.transaction ?? 0),
    deposit: Number(row?.deposit ?? 0),
    withdrawal: Number(row?.withdrawal ?? 0),
    bet: Number(row?.bet ?? 0),
  };
}

export async function getPlayerAuditPage({
  page = 1,
  pageSize = 12,
  source,
  q,
}: {
  page?: number;
  pageSize?: number;
  source?: PlayerAuditSource;
  q?: string;
}) {
  await verifyCapability("view_audit");
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  const offset = (safePage - 1) * safePageSize;

  const blankCounts: Record<PlayerAuditSource, number> = { transaction: 0, deposit: 0, withdrawal: 0, bet: 0 };
  const emptyResult = {
    rows: [],
    page: safePage,
    pageSize: safePageSize,
    total: 0,
    totalPages: 1,
    counts: blankCounts,
  };

  try {
  // Each source is its own SELECT; a source filter simply leaves the others
  // out of the UNION, so filtering never scans tables it doesn't need.
  const parts: Record<PlayerAuditSource, SQL> = {
    transaction: sql`
          SELECT
            t.id::text                                                       AS id,
            'transaction'                                                    AS source,
            p.id::text                                                       AS user_id,
            p.username,
            p.display_name,
            t.type                                                           AS event,
            'Wallet ledger'                                                  AS category,
            t.amount::text                                                   AS amount,
            w.currency,
            t.type                                                           AS status,
            t.reference_type,
            t.reference_id::text                                             AS reference_id,
            jsonb_build_object('description', t.description,
                               'metadata',    t.metadata)                   AS details,
            t.created_at
          FROM transactions t
          INNER JOIN wallets w ON w.id = t.wallet_id
          INNER JOIN profiles p ON p.id = w.user_id`,
    deposit: sql`
          SELECT
            d.id::text                                                       AS id,
            'deposit'                                                        AS source,
            d.user_id::text                                                  AS user_id,
            p.username,
            p.display_name,
            d.status                                                         AS event,
            'Cash in'                                                        AS category,
            d.amount::text                                                   AS amount,
            d.currency,
            d.status,
            'gateway'                                                        AS reference_type,
            COALESCE(d.gateway_ref, d.payment_account_id::text)             AS reference_id,
            d.metadata                                                       AS details,
            d.created_at
          FROM deposits d
          LEFT JOIN profiles p ON p.id = d.user_id`,
    withdrawal: sql`
          SELECT
            wt.id::text                                                      AS id,
            'withdrawal'                                                     AS source,
            wt.user_id::text                                                 AS user_id,
            p.username,
            p.display_name,
            wt.status                                                        AS event,
            'Cash out'                                                       AS category,
            wt.amount::text                                                  AS amount,
            wt.currency,
            wt.status,
            wt.method                                                        AS reference_type,
            wt.gateway_ref                                                   AS reference_id,
            jsonb_build_object('destination',       wt.destination,
                               'rejection_reason',  wt.rejection_reason)    AS details,
            wt.created_at
          FROM withdrawals wt
          LEFT JOIN profiles p ON p.id = wt.user_id`,
    bet: sql`
          SELECT
            b.id::text                                                       AS id,
            'bet'                                                            AS source,
            b.user_id::text                                                  AS user_id,
            p.username,
            p.display_name,
            COALESCE(gr.game_type, 'game')                                  AS event,
            'Gameplay'                                                       AS category,
            b.amount::text                                                   AS amount,
            b.currency,
            b.status,
            'round'                                                          AS reference_type,
            b.round_id::text                                                 AS reference_id,
            jsonb_build_object('choice',      b.choice,
                               'payout',      b.payout,
                               'profit',      b.profit,
                               'multiplier',  gr.multiplier)                AS details,
            b.created_at
          FROM bets b
          LEFT JOIN profiles p ON p.id = b.user_id
          LEFT JOIN game_rounds gr ON gr.id = b.round_id`,
  };

  const sources = source ? [source] : (Object.keys(parts) as PlayerAuditSource[]);
  const union = sql.join(sources.map((s) => parts[s]), sql` UNION ALL `);

  const term = searchTerm(q);
  const pat = likePattern(term);
  const filter = term
    ? sql`WHERE combined.username ILIKE ${pat}
             OR combined.display_name ILIKE ${pat}
             OR combined.user_id ILIKE ${pat}
             OR combined.id ILIKE ${pat}
             OR combined.reference_id ILIKE ${pat}
             OR combined.event ILIKE ${pat}`
    : sql``;

  const [rows, counts, searchedTotal] = await Promise.all([
    db.execute<{
      id: string;
      source: string;
      user_id: string;
      username: string | null;
      display_name: string | null;
      event: string;
      category: string;
      amount: string | null;
      currency: string | null;
      status: string | null;
      reference_type: string | null;
      reference_id: string | null;
      details: unknown;
      created_at: Date;
    }>(sql`
      SELECT * FROM (${union}) combined
      ${filter}
      ORDER BY created_at DESC
      LIMIT ${safePageSize} OFFSET ${offset}
    `),
    playerAuditCounts(),
    // Unfiltered totals come free from the per-source counts; only a search
    // needs the union counted.
    term
      ? db.execute<{ total: string }>(sql`SELECT COUNT(*)::text AS total FROM (${union}) combined ${filter}`)
      : Promise.resolve(null),
  ]);

  const total = searchedTotal
    ? Number(Array.from(searchedTotal)[0]?.total ?? 0)
    : sources.reduce((n, s) => n + counts[s], 0);

  return {
    rows: Array.from(rows).map((row) => ({
      id: row.id,
      source: row.source as PlayerAuditRow["source"],
      user_id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      event: row.event ?? "unknown",
      category: row.category,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      details: normalizeDetails(row.details),
      created_at: toIso(row.created_at),
    })),
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    counts,
  };
  } catch (err) {
    console.error("[admin] player audit query failed", err);
    return emptyResult;
  }
}
