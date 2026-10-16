// Snooze state for the "Better in Fullscreen" nudge.
//
// Without this the nudge re-appears on essentially every round played outside
// fullscreen, which nags the user even right after they dismiss it. Once the
// user dismisses it we snooze the nudge for a while and persist that window in
// localStorage so it survives round-to-round re-renders, switching between
// games, and page reloads.

const LS_KEY = "bp_fs_warn_snooze_until";

// How long to suppress the nudge after the user dismisses it.
export const FS_WARN_SNOOZE_MS = 30 * 60 * 1000; // 30 minutes

// Suppress the fullscreen nudge for the next `ms` milliseconds.
export function snoozeFsWarn(ms: number = FS_WARN_SNOOZE_MS): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(LS_KEY, String(Date.now() + ms));
    } catch {
        /* ignore quota / privacy-mode errors */
    }
}

// True while the nudge is still snoozed.
export function isFsWarnSnoozed(): boolean {
    if (typeof window === "undefined") return false;
    try {
        const until = Number(localStorage.getItem(LS_KEY) ?? 0);
        return Date.now() < until;
    } catch {
        return false;
    }
}

// Clear the snooze — call when the user goes fullscreen, so the concern is resolved.
export function clearFsWarnSnooze(): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(LS_KEY);
    } catch {
        /* ignore */
    }
}
