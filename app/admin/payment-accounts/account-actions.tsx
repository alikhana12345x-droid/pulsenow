"use client";

import { togglePaymentAccount, resetDailyUsed, deletePaymentAccount } from "@/lib/actions/payment-accounts";
import { useState } from "react";

export function ToggleAccountButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await togglePaymentAccount(id, !isActive);
        setLoading(false);
      }}
      className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
        isActive
          ? "bg-green-500/15 text-green-400 hover:bg-red-500/15 hover:text-red-400"
          : "bg-red-500/15 text-red-400 hover:bg-green-500/15 hover:text-green-400"
      }`}
    >
      {loading ? "..." : isActive ? "Active" : "Inactive"}
    </button>
  );
}

export function ResetDailyButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!confirm("Reset daily usage counter to 0?")) return;
        setLoading(true);
        await resetDailyUsed(id);
        setLoading(false);
      }}
      className="text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent transition-colors"
    >
      {loading ? "..." : "Reset daily"}
    </button>
  );
}

export function DeleteAccountButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!confirm("Delete this payment account? This cannot be undone.")) return;
        setLoading(true);
        await deletePaymentAccount(id);
        setLoading(false);
      }}
      className="text-xs px-3 py-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors ml-auto"
    >
      {loading ? "..." : "Delete"}
    </button>
  );
}
