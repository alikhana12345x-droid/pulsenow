/**
 * Shared contract for the platform reset. Kept out of the `"use server"` action
 * module because those may only export async functions — a plain const there
 * fails the build, and the confirmation phrase has to be readable by the client
 * that renders the input as well as by the server that validates it.
 */

/** Typed by the operator before the reset will run. Verified server-side. */
export const RESET_CONFIRMATION = "DELETE ALL DATA";

export type ResetSummary = {
  players: number;
  bets: number;
  rounds: number;
  deposits: number;
  withdrawals: number;
  housePayouts: number;
  transactions: number;
  referrals: number;
  promotionGrants: number;
  auditEntries: number;
  authUsersDeleted: number;
  authUsersFailed: string[];
};
