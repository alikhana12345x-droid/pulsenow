"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { adminSyncDeposit, adminSyncWithdrawal } from "@/lib/actions/gateway-sync";

/**
 * Gateway-settled money has nothing to approve — the provider decides the
 * outcome. This just asks it where the order got to and applies the answer,
 * for the occasional missed callback.
 */
export function SyncStatusButton({
  id,
  kind,
  compact = false,
}: {
  id: string;
  kind: "deposit" | "withdrawal";
  /** Icon only — for table rows where the actions column is tight. */
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setNote(null);
          try {
            const result =
              kind === "deposit" ? await adminSyncDeposit(id) : await adminSyncWithdrawal(id);
            setNote(
              result.changed
                ? `Settled as ${result.status}`
                : result.reason ?? "No change yet"
            );
          } catch (e: unknown) {
            setNote(e instanceof Error ? e.message : "Sync failed");
          } finally {
            setLoading(false);
          }
        }}
        className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-secondary text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 ${
          compact ? "h-7 w-7" : "px-3 py-1.5"
        }`}
        title="Sync status — ask the payment gateway for the latest status"
        aria-label="Sync status"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        {!compact && (loading ? "Checking…" : "Sync status")}
      </button>
      {note && <span className="max-w-[180px] text-right text-[11px] text-muted-foreground">{note}</span>}
    </div>
  );
}
