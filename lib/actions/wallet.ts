"use server";

import { db } from "@/lib/db";
import { wallets, transactions } from "@/lib/supabase/schema";
import { eq, and, desc } from "drizzle-orm";

export async function getOrCreateWallet(userId: string, currency = "PKR") {
  const existing = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.user_id, userId), eq(wallets.currency, currency)))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(wallets)
    .values({ user_id: userId, currency, balance: "0.00" })
    .returning();
  return created;
}

export async function getWallet(userId: string, currency = "PKR") {
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.user_id, userId), eq(wallets.currency, currency)))
    .limit(1);
  return wallet ?? null;
}

export async function getTransactionHistory(walletId: string, limit = 20) {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.wallet_id, walletId))
    .orderBy(desc(transactions.created_at))
    .limit(limit);
}

export async function creditWallet(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  walletId: string,
  amount: number,
  type: string,
  referenceType: string,
  referenceId: string,
  description: string
) {
  const [wallet] = await tx
    .select()
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .for("update");

  if (!wallet) throw new Error("Wallet not found");

  const before = Number(wallet.balance);
  const after = before + amount;

  await tx
    .update(wallets)
    .set({
      balance: String(after),
      total_deposited: type === "deposit"
        ? String(Number(wallet.total_deposited) + amount)
        : wallet.total_deposited,
      updated_at: new Date(),
    })
    .where(eq(wallets.id, walletId));

  await tx.insert(transactions).values({
    wallet_id: walletId,
    type,
    amount: String(amount),
    balance_before: String(before),
    balance_after: String(after),
    reference_type: referenceType,
    reference_id: referenceId,
    description,
  });
}
