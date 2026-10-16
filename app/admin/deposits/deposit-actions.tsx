"use client";

import { useState } from "react";
import { adminForceCompleteDeposit, adminCancelDeposit } from "@/lib/actions/admin";

export function ForceCompleteDepositButton({ depositId }: { depositId: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!confirm("Approve this deposit and credit the user's wallet?")) return;
        setLoading(true);
        try {
          await adminForceCompleteDeposit(depositId);
        } catch (e: unknown) {
          alert(e instanceof Error ? e.message : "Failed");
        } finally {
          setLoading(false);
        }
      }}
      className="h-7 whitespace-nowrap rounded-lg bg-green-500/15 px-2.5 text-xs text-green-400 transition-colors hover:bg-green-500/25 disabled:opacity-50"
    >
      {loading ? "..." : "Approve"}
    </button>
  );
}

export function CancelDepositButton({ depositId }: { depositId: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!confirm("Reject this deposit? The user will not be credited.")) return;
        setLoading(true);
        try {
          await adminCancelDeposit(depositId);
        } catch (e: unknown) {
          alert(e instanceof Error ? e.message : "Failed");
        } finally {
          setLoading(false);
        }
      }}
      className="h-7 whitespace-nowrap rounded-lg bg-red-500/15 px-2.5 text-xs text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-50"
    >
      {loading ? "..." : "Reject"}
    </button>
  );
}
