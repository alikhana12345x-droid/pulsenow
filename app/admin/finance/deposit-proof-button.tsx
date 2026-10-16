"use client";

import { useState } from "react";
import { getDepositProof } from "@/lib/actions/admin";

type Proof = {
  proof_url: string | null;
  metadata: unknown;
  amount: string;
  currency: string;
} | null;

function senderRefOf(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object") {
    const ref = (metadata as Record<string, unknown>).sender_ref;
    if (typeof ref === "string" && ref.trim()) return ref;
  }
  return null;
}

export function DepositProofButton({ depositId }: { depositId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [proof, setProof] = useState<Proof>(null);

  const view = async () => {
    setLoading(true);
    try {
      const data = await getDepositProof(depositId);
      setProof(data);
      setOpen(true);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to load proof");
    } finally {
      setLoading(false);
    }
  };

  const senderRef = proof ? senderRefOf(proof.metadata) : null;

  return (
    <>
      <button
        onClick={view}
        disabled={loading}
        className="h-7 whitespace-nowrap rounded-lg bg-secondary px-2.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
      >
        {loading ? "..." : "View proof"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl border border-border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold tracking-tight">Payment proof</h3>
                {proof && (
                  <p className="text-xs text-muted-foreground">
                    {Number(proof.amount).toLocaleString("en-PK")} {proof.currency}
                  </p>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg bg-secondary px-3 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                Close
              </button>
            </div>

            {proof?.proof_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proof.proof_url} alt="payment proof" className="w-full rounded-xl border border-border" />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No screenshot was attached to this deposit.
              </p>
            )}

            {senderRef && (
              <p className="mt-3 text-sm text-muted-foreground">
                Sender ref: <span className="font-mono text-foreground">{senderRef}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
