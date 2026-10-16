"use server";

import { revalidatePath } from "next/cache";
import { verifyCapability } from "@/lib/auth/permissions";
import {
  reconcileSolidPayDeposit,
  reconcileSolidPayWithdrawal,
} from "@/lib/finance/solidpay-reconcile";

/**
 * Admin-triggered reconciliation for gateway-settled money.
 *
 * SolidPay deposits and payouts settle themselves through callbacks, so there
 * is nothing for an admin to approve. What an admin does occasionally need is
 * to ask the provider where an order got to — when a callback was missed, or
 * the player closed the sheet before the poll settled it.
 *
 * These only ever apply the provider's own verdict; they cannot credit or
 * reject anything on their own.
 */

export type SyncResult = { status: string; reason: string | null; changed: boolean };

export async function adminSyncDeposit(depositId: string): Promise<SyncResult> {
  await verifyCapability("manage_deposits");

  const result = await reconcileSolidPayDeposit(depositId);

  if (result.changed) {
    revalidatePath("/admin/finance");
    revalidatePath("/protected", "layout");
  }
  return result;
}

export async function adminSyncWithdrawal(withdrawalId: string): Promise<SyncResult> {
  await verifyCapability("manage_withdrawals");

  const result = await reconcileSolidPayWithdrawal(withdrawalId);

  if (result.changed) {
    revalidatePath("/admin/finance");
    revalidatePath("/protected", "layout");
  }
  return result;
}
