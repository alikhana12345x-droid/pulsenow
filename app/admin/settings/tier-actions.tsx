"use client";

import { useState, type FormEvent } from "react";
import {
  upsertTier,
  deleteTier,
  toggleTier,
  type TierInput,
} from "@/lib/actions/game-settings";
import type { getTiers } from "@/lib/actions/game-settings";

type Tier = Awaited<ReturnType<typeof getTiers>>[0];

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Overlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    />
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      <Overlay onClose={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-md overflow-hidden rounded-[24px] border border-border/70 bg-bp-mid shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </div>
      </div>
    </>
  );
}

function FieldRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border/70 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";

// ─── Tier form fields (shared between create and edit) ────────────────────────

function TierFormFields({ defaults }: { defaults?: Tier; nextOrder?: number }) {
  return (
    <>
      <FieldRow label="Label" required>
        <input
          name="label"
          defaultValue={defaults?.label ?? ""}
          placeholder="e.g. Basic"
          className={inputCls}
          required
        />
      </FieldRow>

      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Min Amount (PKR)" required>
          <input
            name="min_amount"
            type="number"
            min="0"
            step="1"
            defaultValue={defaults ? Number(defaults.min_amount) : ""}
            placeholder="10"
            className={inputCls}
            required
          />
        </FieldRow>
        <FieldRow label="Max Amount (PKR)" required>
          <input
            name="max_amount"
            type="number"
            min="0"
            step="1"
            defaultValue={defaults ? Number(defaults.max_amount) : ""}
            placeholder="50"
            className={inputCls}
            required
          />
        </FieldRow>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Win Probability (%)" required>
          <input
            name="win_probability"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={defaults?.win_probability ?? ""}
            placeholder="35"
            className={inputCls}
            required
          />
        </FieldRow>
        <FieldRow label="Sort Order" required>
          <input
            name="sort_order"
            type="number"
            min="0"
            step="1"
            defaultValue={defaults?.sort_order ?? 0}
            className={inputCls}
            required
          />
        </FieldRow>
      </div>
    </>
  );
}

function parseTierForm(fd: FormData, id?: string): TierInput {
  return {
    id,
    label: (fd.get("label") as string).trim(),
    min_amount: parseFloat(fd.get("min_amount") as string),
    max_amount: parseFloat(fd.get("max_amount") as string),
    win_probability: parseInt(fd.get("win_probability") as string, 10),
    sort_order: parseInt(fd.get("sort_order") as string, 10),
  };
}

// ─── Create Tier ──────────────────────────────────────────────────────────────

export function CreateTierButton({ nextOrder }: { nextOrder: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const input = parseTierForm(new FormData(e.currentTarget));
    if (!input.label) return setError("Label is required.");
    if (isNaN(input.min_amount) || isNaN(input.max_amount)) return setError("Min/Max must be numbers.");
    if (input.min_amount >= input.max_amount) return setError("Min must be less than Max.");
    if (isNaN(input.win_probability) || input.win_probability < 0 || input.win_probability > 100)
      return setError("Win probability must be 0–100.");

    setLoading(true);
    try {
      await upsertTier({ ...input, sort_order: input.sort_order ?? nextOrder });
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create tier.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
      >
        + Add Tier
      </button>

      {open && (
        <Modal title="New Tier" onClose={() => setOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <TierFormFields nextOrder={nextOrder} />

            {error && (
              <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-border/70 bg-card py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50"
              >
                {loading ? "Creating…" : "Create Tier"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─── Edit Tier ────────────────────────────────────────────────────────────────

export function EditTierButton({ tier }: { tier: Tier }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const input = parseTierForm(new FormData(e.currentTarget), tier.id);
    if (!input.label) return setError("Label is required.");
    if (isNaN(input.min_amount) || isNaN(input.max_amount)) return setError("Min/Max must be numbers.");
    if (input.min_amount >= input.max_amount) return setError("Min must be less than Max.");
    if (isNaN(input.win_probability) || input.win_probability < 0 || input.win_probability > 100)
      return setError("Win probability must be 0–100.");

    setLoading(true);
    try {
      await upsertTier(input);
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update tier.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="whitespace-nowrap rounded-lg bg-primary/15 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/25"
      >
        Edit
      </button>

      {open && (
        <Modal title="Edit Tier" onClose={() => setOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <TierFormFields defaults={tier} />

            {error && (
              <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-border/70 bg-card py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50"
              >
                {loading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─── Toggle Tier ──────────────────────────────────────────────────────────────

export function ToggleTierButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!confirm(`${isActive ? "Disable" : "Enable"} this tier?`)) return;
        setLoading(true);
        try {
          await toggleTier(id, !isActive);
        } catch (e: unknown) {
          alert(e instanceof Error ? e.message : "Failed");
        } finally {
          setLoading(false);
        }
      }}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
        isActive
          ? "bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25"
          : "bg-green-500/15 text-green-400 hover:bg-green-500/25"
      }`}
    >
      {loading ? "…" : isActive ? "Disable" : "Enable"}
    </button>
  );
}

// ─── Delete Tier ──────────────────────────────────────────────────────────────

export function DeleteTierButton({ id, label }: { id: string; label: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!confirm(`Delete tier "${label}"? This cannot be undone.`)) return;
        setLoading(true);
        try {
          await deleteTier(id);
        } catch (e: unknown) {
          alert(e instanceof Error ? e.message : "Failed");
        } finally {
          setLoading(false);
        }
      }}
      className="whitespace-nowrap rounded-lg bg-red-500/15 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-50"
    >
      {loading ? "…" : "Delete"}
    </button>
  );
}
