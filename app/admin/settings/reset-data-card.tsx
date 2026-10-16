"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { resetPlatformData } from "@/lib/actions/platform-reset";
import { RESET_CONFIRMATION, type ResetSummary } from "@/lib/platform-reset";

const DELETED = [
  "Every player account, including their login",
  "All bets and game rounds",
  "All deposits, withdrawals, house payouts and wallet ledger entries",
  "All referrals and promotion grants",
  "The admin audit log",
];

const KEPT = [
  "Admin and superadmin accounts",
  "The games catalogue",
  "Payment accounts and gateway credentials",
  "Bet tiers (win probabilities) and payment mode",
];

export function ResetDataCard() {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetSummary | null>(null);
  const router = useRouter();

  const armed = phrase.trim() === RESET_CONFIRMATION;

  const run = async () => {
    if (!armed) return;
    if (
      !confirm(
        "This permanently deletes every player account and all activity. It cannot be undone.\n\nProceed?"
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const summary = await resetPlatformData(phrase.trim());
      setResult(summary);
      setPhrase("");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-500/15 text-red-400">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400/80">
            Danger zone
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">Reset platform data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Wipes the platform back to a clean install. Staff keep their access, so
            you stay logged in and the app is usable immediately afterwards.
            This cannot be undone.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-red-500/20 bg-background/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-400">
                Deleted
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {DELETED.map((item) => (
                  <li key={item}>&middot; {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                Kept
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {KEPT.map((item) => (
                  <li key={item}>&middot; {item}</li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Type <span className="font-mono font-semibold text-red-400">{RESET_CONFIRMATION}</span> to
            enable the button.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={RESET_CONFIRMATION}
              disabled={busy}
              spellCheck={false}
              autoComplete="off"
              className="h-10 flex-1 rounded-lg border border-border/70 bg-card px-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-red-500/50 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={run}
              disabled={!armed || busy}
              className="h-10 shrink-0 rounded-lg bg-red-500/15 px-4 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Deleting..." : "Delete all data"}
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {result && (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
              <p className="font-semibold">Platform reset.</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                {[
                  ["Players", result.players],
                  ["Logins removed", result.authUsersDeleted],
                  ["Bets", result.bets],
                  ["Rounds", result.rounds],
                  ["Deposits", result.deposits],
                  ["Withdrawals", result.withdrawals],
                  ["House payouts", result.housePayouts],
                  ["Ledger entries", result.transactions],
                  ["Referrals", result.referrals],
                  ["Promo grants", result.promotionGrants],
                  ["Audit entries", result.auditEntries],
                ].map(([label, n]) => (
                  <li key={label as string} className="flex justify-between gap-2">
                    <span className="text-emerald-400/70">{label}</span>
                    <span className="font-mono font-semibold tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
              {result.authUsersFailed.length > 0 && (
                <p className="mt-2 text-xs text-amber-400">
                  {result.authUsersFailed.length} login(s) could not be removed:{" "}
                  {result.authUsersFailed.join("; ")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
