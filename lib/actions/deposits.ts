"use server";

import { db } from "@/lib/db";
import { deposits, payment_accounts } from "@/lib/supabase/schema";
import { eq, and, desc } from "drizzle-orm";
import { getOrCreateWallet, creditWallet } from "./wallet";
import { getActiveDepositAccounts } from "./payment-accounts";
import { revalidatePath } from "next/cache";

const SANDBOX = process.env.NEXT_PUBLIC_SANDBOX_MODE === "true";

export async function createDeposit(data: {
  userId: string;
  gateway: string;
  amount: number;
  currency?: string;
  proofUrl?: string;
}) {
  const currency = data.currency ?? "PKR";
  const wallet = await getOrCreateWallet(data.userId, currency);

  const accounts = await getActiveDepositAccounts(data.gateway as any, data.amount);
  if (!accounts.length) throw new Error("No payment accounts available for this gateway. Try another method.");

  const account = accounts[0];

  const [deposit] = await db
    .insert(deposits)
    .values({
      user_id: data.userId,
      wallet_id: wallet.id,
      payment_account_id: account.id,
      amount: String(data.amount),
      currency,
      status: SANDBOX ? "confirmed" : "pending",
      proof_url: data.proofUrl ?? null,
    })
    .returning();

  if (SANDBOX) {
    await db.transaction(async (tx) => {
      await creditWallet(tx, wallet.id, data.amount, "deposit", "deposit", deposit.id, `Deposit via ${data.gateway} (sandbox)`);
      await tx
        .update(deposits)
        .set({ confirmed_at: new Date() })
        .where(eq(deposits.id, deposit.id));
    });
  }

  revalidatePath("/protected", "layout");
  return { deposit, account, sandboxConfirmed: SANDBOX };
}

export async function getPendingDeposits() {
  return db
    .select()
    .from(deposits)
    .where(eq(deposits.status, "pending"))
    .orderBy(desc(deposits.created_at))
    .limit(100);
}

export async function getUserDeposits(userId: string) {
  // Explicit columns — never ship the base64 proof_url in the history payload.
  // Joins the account so the history view can show the method (JazzCash, etc.).
  return db
    .select({
      id: deposits.id,
      amount: deposits.amount,
      currency: deposits.currency,
      status: deposits.status,
      gateway_ref: deposits.gateway_ref,
      payment_account_id: deposits.payment_account_id,
      gateway: payment_accounts.gateway,
      account_label: payment_accounts.label,
      created_at: deposits.created_at,
      confirmed_at: deposits.confirmed_at,
    })
    .from(deposits)
    .leftJoin(payment_accounts, eq(payment_accounts.id, deposits.payment_account_id))
    .where(eq(deposits.user_id, userId))
    .orderBy(desc(deposits.created_at))
    .limit(20);
}

export async function confirmDeposit(depositId: string, adminId: string | null) {
  const [deposit] = await db
    .select()
    .from(deposits)
    .where(and(eq(deposits.id, depositId), eq(deposits.status, "pending")))
    .limit(1);

  if (!deposit) throw new Error("Deposit not found or already processed");

  await db.transaction(async (tx) => {
    await creditWallet(
      tx,
      deposit.wallet_id,
      Number(deposit.amount),
      "deposit",
      "deposit",
      deposit.id,
      `Deposit via ${deposit.currency} confirmed`
    );

    await tx
      .update(deposits)
      .set({ status: "confirmed", confirmed_by: adminId, confirmed_at: new Date() })
      .where(eq(deposits.id, depositId));

    await tx
      .update(payment_accounts)
      .set({ daily_used: String(Number(deposit.amount)) })
      .where(eq(payment_accounts.id, deposit.payment_account_id));
  });

  revalidatePath("/admin/finance");
  revalidatePath("/protected", "layout");
}
