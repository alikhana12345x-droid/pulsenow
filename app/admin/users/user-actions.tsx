"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Pencil } from "lucide-react";
import {
  banUser,
  unbanUser,
  changeUserRole,
  adminAdjustBalance,
  setPlayerHealth,
  setWithdrawalHold,
} from "@/lib/actions/admin";
import { cn } from "@/lib/utils";
import { RoleTag, UserIdentity, type Identity } from "../user-identity";
import { Modal } from "../admin-modal";

// ─── Shared UI helpers (match tier-actions styling) ───────────────────────────

/**
 * Loading / error / close-guard plumbing shared by every dialog below.
 *
 * Dialogs also copy the row values they display into state when they open:
 * saving revalidates the page, and live props would change under the closing
 * dialog (a ban would briefly flip it into the unban dialog, and so on).
 */
function useDialogAction(onClose: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Guards the gap before `loading` re-renders the submit button as disabled —
  // a double-submitted balance credit would pay out twice.
  const inFlight = useRef(false);

  async function run(action: () => Promise<unknown>, fallbackError: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    setLoading(true);
    try {
      await action();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : fallbackError);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  // A request in flight can't be recalled, so keep the dialog up to show its outcome.
  const close = () => {
    if (!loading) onClose();
  };

  return { loading, error, run, close };
}

function FieldRow({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
      >
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground/70">{hint}</p>
      ) : null}
    </div>
  );
}

/** Who the dialog is acting on — the row it was opened from is hidden behind it. */
function TargetCard({ user }: { user: Identity }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 px-3 py-2.5">
      <UserIdentity user={user} size={34} />
    </div>
  );
}

function SummaryRow({
  label,
  strong,
  children,
}: {
  label: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={`font-mono ${strong ? "font-semibold" : ""}`}>{children}</span>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return message ? (
    <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{message}</p>
  ) : null;
}

const SUBMIT_TONE = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/80",
  danger: "bg-red-500/15 text-red-400 hover:bg-red-500/25",
  success: "bg-green-500/15 text-green-400 hover:bg-green-500/25",
};

function DialogActions({
  onCancel,
  disabled,
  label,
  tone = "primary",
}: {
  onCancel: () => void;
  disabled: boolean;
  label: string;
  tone?: keyof typeof SUBMIT_TONE;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded-xl border border-border/70 bg-card py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={disabled}
        className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors disabled:opacity-50 ${SUBMIT_TONE[tone]}`}
      >
        {label}
      </button>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border/70 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";

// ─── Ban / unban ──────────────────────────────────────────────────────────────

export function BanToggleButton({
  user,
  isBanned,
  banReason,
  className,
}: {
  user: Identity;
  isBanned: boolean;
  banReason: string | null;
  className?: string;
}) {
  // Fixed at click time — `isBanned` flips as soon as the save revalidates.
  const [dialog, setDialog] = useState<"ban" | "unban" | null>(null);
  const close = () => setDialog(null);

  return (
    <>
      <button
        onClick={() => setDialog(isBanned ? "unban" : "ban")}
        className={cn(
          "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors",
          isBanned
            ? "bg-green-500/15 text-green-400 hover:bg-green-500/25"
            : "bg-red-500/15 text-red-400 hover:bg-red-500/25",
          className
        )}
      >
        {isBanned ? "Unban" : "Ban"}
      </button>
      {dialog === "ban" && <BanDialog user={user} onClose={close} />}
      {dialog === "unban" && <UnbanDialog user={user} banReason={banReason} onClose={close} />}
    </>
  );
}

function BanDialog({ user, onClose }: { user: Identity; onClose: () => void }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const { loading, error, run, close } = useDialogAction(onClose);
  const canSubmit = reason.trim() !== "" && !loading;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    await run(() => banUser(user.id, reason.trim()), "Failed to ban user.");
  }

  return (
    <Modal title="Ban user" onClose={close}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TargetCard user={user} />

        <p className="text-sm text-muted-foreground">
          They&apos;ll be sent to the suspension screen on their next page load and stay locked
          out until unbanned.
        </p>

        <FieldRow
          label="Reason"
          htmlFor={`${id}-reason`}
          required
          hint="Shown to the player on their suspension screen."
        >
          <input
            id={`${id}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Multiple accounts"
            maxLength={200}
            autoComplete="off"
            autoFocus
            disabled={loading}
            className={inputCls}
          />
        </FieldRow>

        <ErrorNote message={error} />

        <DialogActions
          onCancel={close}
          disabled={!canSubmit}
          label={loading ? "Banning…" : "Ban user"}
          tone="danger"
        />
      </form>
    </Modal>
  );
}

function UnbanDialog({
  user,
  banReason,
  onClose,
}: {
  user: Identity;
  banReason: string | null;
  onClose: () => void;
}) {
  const [reason] = useState(banReason);
  const { loading, error, run, close } = useDialogAction(onClose);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(() => unbanUser(user.id), "Failed to unban user.");
  }

  return (
    <Modal title="Unban user" onClose={close}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TargetCard user={user} />

        {reason && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-red-400/80">
              Banned for
            </p>
            <p className="mt-0.5 text-sm text-foreground/80">{reason}</p>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          They&apos;ll get access back on their next page load.
        </p>

        <ErrorNote message={error} />

        <DialogActions
          onCancel={close}
          disabled={loading}
          label={loading ? "Unbanning…" : "Unban user"}
          tone="success"
        />
      </form>
    </Modal>
  );
}

// ─── Withdrawal hold ──────────────────────────────────────────────────────────

export function WithdrawalHoldButton({
  user,
  held,
  className,
}: {
  user: Identity;
  held: boolean;
  className?: string;
}) {
  // Fixed at click time — `held` flips as soon as the save revalidates.
  const [dialog, setDialog] = useState<"hold" | "release" | null>(null);
  const close = () => setDialog(null);

  return (
    <>
      <button
        onClick={() => setDialog(held ? "release" : "hold")}
        title={held ? "Withdrawals are on hold — click to release" : "Hold this player's withdrawals"}
        className={cn(
          "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors",
          held
            ? "bg-green-500/15 text-green-400 hover:bg-green-500/25"
            : "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25",
          className
        )}
      >
        {held ? "Release" : "Hold"}
      </button>
      {dialog === "hold" && <HoldWithdrawalsDialog user={user} onClose={close} />}
      {dialog === "release" && <ReleaseWithdrawalsDialog user={user} onClose={close} />}
    </>
  );
}

function HoldWithdrawalsDialog({ user, onClose }: { user: Identity; onClose: () => void }) {
  const id = useId();
  const [note, setNote] = useState("");
  const { loading, error, run, close } = useDialogAction(onClose);
  const canSubmit = note.trim() !== "" && !loading;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    await run(() => setWithdrawalHold(user.id, true, note.trim()), "Failed to hold withdrawals.");
  }

  return (
    <Modal title="Hold withdrawals" onClose={close}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TargetCard user={user} />

        <p className="text-sm text-muted-foreground">
          They can still request withdrawals, and the amount is reserved from their balance as
          normal — but nothing is sent to the payment gateway. Each request waits in Finance →
          Withdrawals, marked <span className="font-semibold text-orange-400">Held</span>, until you
          pay it by hand or reject it (which refunds them).
        </p>

        <FieldRow
          label="Internal note"
          htmlFor={`${id}-note`}
          required
          hint="Only admins see this — it's saved to the audit log."
        >
          <input
            id={`${id}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Suspected bonus abuse — review before paying"
            maxLength={200}
            autoComplete="off"
            autoFocus
            disabled={loading}
            className={inputCls}
          />
        </FieldRow>

        <ErrorNote message={error} />

        <DialogActions
          onCancel={close}
          disabled={!canSubmit}
          label={loading ? "Holding…" : "Hold withdrawals"}
          tone="danger"
        />
      </form>
    </Modal>
  );
}

function ReleaseWithdrawalsDialog({ user, onClose }: { user: Identity; onClose: () => void }) {
  const { loading, error, run, close } = useDialogAction(onClose);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(() => setWithdrawalHold(user.id, false, ""), "Failed to release the hold.");
  }

  return (
    <Modal title="Release withdrawal hold" onClose={close}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TargetCard user={user} />

        <p className="text-sm text-muted-foreground">
          New withdrawals go through the normal payout flow again. Requests made while the hold was
          on stay in Finance → Withdrawals until you pay or reject them.
        </p>

        <ErrorNote message={error} />

        <DialogActions
          onCancel={close}
          disabled={loading}
          label={loading ? "Releasing…" : "Release hold"}
          tone="success"
        />
      </form>
    </Modal>
  );
}

// ─── Role ─────────────────────────────────────────────────────────────────────

/** One-line summaries of the capability table in lib/auth/roles.ts. */
const ROLE_SUMMARY: Record<string, string> = {
  player: "A regular player account with no admin panel access.",
  admin:
    "Admin panel for day-to-day work: players, deposits and withdrawals, games, promotions and referrals.",
  superadmin:
    "Full control, including staff roles, balance adjustments, reports, audit and platform settings.",
};

export function RoleSelect({ user, currentRole }: { user: Identity; currentRole: string }) {
  const [nextRole, setNextRole] = useState<string | null>(null);

  return (
    <>
      {/* Controlled by the saved role, so picking an option only opens the
          dialog — the select changes once the new role is actually saved. */}
      <select
        value={currentRole}
        onChange={(e) => {
          if (e.target.value !== currentRole) setNextRole(e.target.value);
        }}
        aria-label="Role"
        className="rounded-lg border border-border/70 bg-card px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
      >
        <option value="player">player</option>
        <option value="admin">admin</option>
        <option value="superadmin">superadmin</option>
      </select>
      {nextRole && (
        <ChangeRoleDialog
          user={user}
          currentRole={currentRole}
          nextRole={nextRole}
          onClose={() => setNextRole(null)}
        />
      )}
    </>
  );
}

function ChangeRoleDialog({
  user,
  currentRole,
  nextRole,
  onClose,
}: {
  user: Identity;
  currentRole: string;
  nextRole: string;
  onClose: () => void;
}) {
  const [from] = useState(currentRole);
  const { loading, error, run, close } = useDialogAction(onClose);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(() => changeUserRole(user.id, nextRole), "Failed to change role.");
  }

  return (
    <Modal title="Change role" onClose={close}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TargetCard user={user} />

        <div className="flex items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3">
          <RoleTag role={from} />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <RoleTag role={nextRole} />
        </div>

        <p className="text-sm text-muted-foreground">{ROLE_SUMMARY[nextRole]}</p>

        <ErrorNote message={error} />

        <DialogActions
          onCancel={close}
          disabled={loading}
          label={loading ? "Changing…" : `Make ${nextRole}`}
        />
      </form>
    </Modal>
  );
}

// ─── Balance adjustment ───────────────────────────────────────────────────────

/** A positive amount with at most two decimals — the wallet stores numeric(18,2). */
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

function formatMoney(value: number) {
  return value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AdjustBalanceButton({
  user,
  balance,
  currency,
  className,
}: {
  user: Identity;
  balance: number;
  currency: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "whitespace-nowrap rounded-lg bg-primary/15 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/25",
          className
        )}
      >
        Adjust
      </button>
      {open && (
        <AdjustBalanceDialog
          user={user}
          balance={balance}
          currency={currency}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AdjustBalanceDialog({
  user,
  balance,
  currency,
  onClose,
}: {
  user: Identity;
  balance: number;
  currency: string;
  onClose: () => void;
}) {
  const id = useId();
  const [current] = useState(balance);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const { loading, error, run, close } = useDialogAction(onClose);

  const trimmed = amount.trim();
  const amountValid = AMOUNT_PATTERN.test(trimmed) && Number(trimmed) > 0;
  const value = amountValid ? Number(trimmed) : 0;
  const isCredit = direction === "credit";
  const newBalance = current + (isCredit ? value : -value);
  const amountError = !trimmed
    ? ""
    : !amountValid
      ? "Enter an amount above 0, e.g. 500 or 99.50"
      : newBalance < 0
        ? "A debit can't take the balance below zero"
        : "";
  const canSubmit = amountValid && newBalance >= 0 && reason.trim() !== "" && !loading;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    await run(
      () => adminAdjustBalance(user.id, isCredit ? value : -value, reason.trim()),
      "Adjustment failed."
    );
  }

  return (
    <Modal title="Adjust balance" onClose={close}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TargetCard user={user} />

        <div
          role="group"
          aria-label="Adjustment type"
          className="grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-card p-1"
        >
          {(["credit", "debit"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={direction === d}
              disabled={loading}
              onClick={() => setDirection(d)}
              className={`rounded-lg py-1.5 text-sm font-medium transition-colors ${
                direction !== d
                  ? "text-muted-foreground hover:bg-accent"
                  : d === "credit"
                    ? "bg-green-500/15 text-green-400"
                    : "bg-orange-500/15 text-orange-400"
              }`}
            >
              {d === "credit" ? "Credit (+)" : "Debit (−)"}
            </button>
          ))}
        </div>

        <FieldRow label={`Amount (${currency})`} htmlFor={`${id}-amount`} required error={amountError}>
          <input
            id={`${id}-amount`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            autoFocus
            disabled={loading}
            className={`${inputCls} font-mono`}
          />
        </FieldRow>

        <FieldRow label="Reason" htmlFor={`${id}-reason`} required>
          <input
            id={`${id}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Tournament prize"
            maxLength={200}
            autoComplete="off"
            disabled={loading}
            className={inputCls}
          />
        </FieldRow>

        <div className="space-y-1.5 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-sm">
          <SummaryRow label="Current balance">
            {currency} {formatMoney(current)}
          </SummaryRow>
          <SummaryRow label={isCredit ? "Credit" : "Debit"}>
            <span className={isCredit ? "text-green-400" : "text-orange-400"}>
              {isCredit ? "+" : "−"} {currency} {formatMoney(value)}
            </span>
          </SummaryRow>
          <div className="!my-2 h-px bg-border/60" />
          <SummaryRow label="New balance" strong>
            <span className={newBalance < 0 ? "text-red-400" : ""}>
              {currency} {formatMoney(newBalance)}
            </span>
          </SummaryRow>
        </div>

        <ErrorNote message={error} />

        <DialogActions
          onCancel={close}
          disabled={!canSubmit}
          label={
            loading
              ? "Applying…"
              : amountValid
                ? `${isCredit ? "Credit" : "Debit"} ${currency} ${formatMoney(value)}`
                : "Apply adjustment"
          }
        />
      </form>
    </Modal>
  );
}

// ─── Health ───────────────────────────────────────────────────────────────────

/** Same bands as the player's own health bar: green above 50%, yellow above 20%, red at 20% or below. */
function healthTone(health: number) {
  if (health > 50) return { bar: "bg-green-400", text: "text-green-400", accent: "accent-green-400" };
  if (health > 20) return { bar: "bg-yellow-400", text: "text-yellow-400", accent: "accent-yellow-400" };
  return { bar: "bg-red-400", text: "text-red-400", accent: "accent-red-400" };
}

export function HealthMeter({ health }: { health: number }) {
  const tone = healthTone(health);

  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-secondary">
        <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${health}%` }} />
      </span>
      <span className={`w-9 font-mono text-xs font-semibold ${tone.text}`}>{health}%</span>
    </span>
  );
}

export function SetHealthButton({ user, health }: { user: Identity; health: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Set health"
        className="-mx-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-accent/60"
      >
        <HealthMeter health={health} />
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && <SetHealthDialog user={user} health={health} onClose={() => setOpen(false)} />}
    </>
  );
}

function SetHealthDialog({
  user,
  health,
  onClose,
}: {
  user: Identity;
  health: number;
  onClose: () => void;
}) {
  const id = useId();
  const [current] = useState(health);
  const [value, setValue] = useState(String(health));
  const { loading, error, run, close } = useDialogAction(onClose);

  const trimmed = value.trim();
  const valid = /^\d{1,3}$/.test(trimmed) && Number(trimmed) <= 100;
  const next = valid ? Number(trimmed) : current;
  const changed = valid && next !== current;
  const tone = healthTone(next);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!changed || loading) return;
    await run(() => setPlayerHealth(user.id, next), "Failed to update health.");
  }

  return (
    <Modal title="Set health" onClose={close}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TargetCard user={user} />

        <FieldRow
          label="Health (%)"
          htmlFor={`${id}-health`}
          error={trimmed && !valid ? "Enter a whole number from 0 to 100" : ""}
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={next}
              onChange={(e) => setValue(e.target.value)}
              disabled={loading}
              aria-label="Health slider"
              className={`h-2 flex-1 cursor-pointer ${tone.accent}`}
            />
            <div className="w-20 shrink-0">
              <input
                id={`${id}-health`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={(e) => e.target.select()}
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                disabled={loading}
                className={`${inputCls} text-center font-mono`}
              />
            </div>
          </div>
        </FieldRow>

        <div className="space-y-1.5 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-sm">
          <SummaryRow label="Current">
            <span className={healthTone(current).text}>{current}%</span>
          </SummaryRow>
          <SummaryRow label="New" strong>
            <span className={tone.text}>{next}%</span>
          </SummaryRow>
        </div>

        <ErrorNote message={error} />

        <DialogActions
          onCancel={close}
          disabled={!changed || loading}
          label={loading ? "Saving…" : "Save health"}
        />
      </form>
    </Modal>
  );
}
