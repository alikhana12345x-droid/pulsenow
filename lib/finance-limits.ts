/**
 * Single source of truth for deposit/withdrawal limits.
 * Imported by both the sheets (client) and the /api routes (server) so the
 * numbers shown to the player always match what the server enforces.
 */

export const MIN_DEPOSIT = 2000;
export const MAX_DEPOSIT = 20000;

/** Per-bet limits, enforced by every game handler in lib/actions/games.ts. */
export const MIN_BET = 10;
export const MAX_BET = 20000;

export const MIN_WITHDRAWAL = 500;
export const MAX_WITHDRAWAL = 20000;

/**
 * Lifetime deposits (wallets.total_deposited) a player must reach before
 * withdrawals unlock. Below this the withdraw action stays disabled.
 */
export const WITHDRAW_MIN_TOTAL_DEPOSIT = 5000;

export const fmtPkr = (n: number) => n.toLocaleString("en-PK");
