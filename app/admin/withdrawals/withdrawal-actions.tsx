"use client";

import { useState } from "react";
import { adminCompleteWithdrawal, adminRejectWithdrawal } from "@/lib/actions/admin";

export function CompleteWithdrawalButton({ withdrawalId }: { withdrawalId: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!confirm("Mark this withdrawal as paid? Only do this once you've sent the money yourself — the player is told it's been sent.")) return;
        setLoading(true);
        try {
          await adminCompleteWithdrawal(withdrawalId);
        } catch (e: unknown) {
          alert(e instanceof Error ? e.message : "Failed");
        } finally {
          setLoading(false);
        }
      }}
      className="h-7 whitespace-nowrap rounded-lg bg-green-500/15 px-2.5 text-xs text-green-400 transition-colors hover:bg-green-500/25 disabled:opacity-50"
    >
      {loading ? "..." : "Complete"}
    </button>
  );
}

export function RejectWithdrawalButton({ withdrawalId }: { withdrawalId: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        const reason = prompt("Reject and refund the player's balance.\nReason (shown to the player):");
        if (reason === null) return;
        if (!reason.trim()) { alert("Reason is required"); return; }
        setLoading(true);
        try {
          await adminRejectWithdrawal(withdrawalId, reason.trim());
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
