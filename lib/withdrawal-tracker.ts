/**
 * Withdrawals this browser is still waiting to hear back on.
 *
 * A payout can settle long after the withdraw sheet was closed — an admin
 * paying it by hand from the Finance desk, or a gateway callback minutes
 * later — so the open ones are remembered here and watched from the finance
 * provider (see useWithdrawalWatcher), which announces each one once it's sent.
 *
 * Browser storage is only a convenience: if it's unavailable or cleared the
 * payout still happens, the player just isn't told in-app.
 */

const KEY = "bp:open-withdrawals";

/** Anything older is dropped rather than watched forever. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type TrackedWithdrawal = {
  id: string;
  amount: number;
  /** Display name of the method, e.g. "JazzCash". */
  methodLabel: string;
  since: number;
};

function read(): TrackedWithdrawal[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.filter(
      (w): w is TrackedWithdrawal => typeof w?.id === "string" && Number(w.since) > cutoff
    );
  } catch {
    return [];
  }
}

function write(list: TrackedWithdrawal[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — nothing to remember with */
  }
}

export function trackWithdrawal(w: Omit<TrackedWithdrawal, "since">) {
  write([...read().filter((x) => x.id !== w.id), { ...w, since: Date.now() }]);
}

export function trackedWithdrawals(): TrackedWithdrawal[] {
  return read();
}

/**
 * Stop watching a withdrawal. Returns whether it was still being watched, so
 * that when the open sheet and the background watcher both see it settle,
 * only the first one announces it.
 */
export function untrackWithdrawal(id: string): boolean {
  const list = read();
  const next = list.filter((w) => w.id !== id);
  if (next.length === list.length) return false;
  write(next);
  return true;
}

const pkr = (amount: number) => `PKR ${amount.toLocaleString("en-PK")}`;

/**
 * Shown as the sheet closes on a request that is recorded but not yet paid.
 * Final-sounding on purpose, but it never claims the money has left — the
 * "sent" toast is kept for when it actually has.
 */
export function withdrawalSubmittedToast(w: { amount: number; methodLabel: string }) {
  return {
    message: "Withdrawal request successful",
    description: `${pkr(w.amount)} to your ${w.methodLabel}`,
  };
}

/** The one wording for "your money is on its way", wherever it's detected. */
export function withdrawalSentToast(w: { amount: number; methodLabel: string }) {
  return {
    message: `${pkr(w.amount)} sent to your ${w.methodLabel}`,
    description: `Your withdrawal is complete — check your ${w.methodLabel} account.`,
  };
}

/** An admin turned it down and refunded it; `reason` is the one they wrote for the player. */
export function withdrawalDeclinedToast(w: { amount: number }, reason: string | null) {
  return {
    message: "Withdrawal declined",
    description: `${reason ? `${reason} — ` : ""}${pkr(w.amount)} has been returned to your balance.`,
  };
}
