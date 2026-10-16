"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const inputCls =
  "w-full rounded-xl border border-border/70 bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";

const MIN_LENGTH = 8;

export function ChangePasswordCard() {
  const [email, setEmail] = useState<string | null>(null);
  // Google-only accounts have no password yet, so there is nothing to verify.
  const [hasPassword, setHasPassword] = useState(true);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (!user) return;
        setEmail(user.email ?? null);
        const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
        setHasPassword(providers.includes("email"));
      });
  }, []);

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setError("");
    setNotice("");
  };

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const canSubmit =
    !saving && !!email && next.length >= MIN_LENGTH && next === confirm && (!hasPassword || current.length > 0);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || !email) return;
    setSaving(true);
    setError("");
    setNotice("");
    const supabase = createClient();
    try {
      if (hasPassword) {
        // updateUser doesn't check the old password, so re-authenticate first.
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current });
        if (authError) throw new Error("Current password is incorrect");
        if (current === next) throw new Error("New password must be different from the current one");
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;
      setCurrent("");
      setNext("");
      setConfirm("");
      setHasPassword(true);
      setNotice("Password updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-border/70 bg-card/80 p-6">
      <div className="max-w-xl space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Account</p>
        <h2 className="text-xl font-bold tracking-tight">Change password</h2>
        <p className="text-sm text-muted-foreground">
          {hasPassword
            ? `Update the password for ${email ?? "your account"}.`
            : `${email ?? "This account"} signs in with Google — set a password to also log in with email.`}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
        {/* Hidden username so password managers attach the new password to the right account. */}
        <input type="email" name="username" autoComplete="username" value={email ?? ""} readOnly hidden />

        <div className="grid gap-4 sm:grid-cols-2">
          {hasPassword && (
            <Field
              id="current-password"
              label="Current password"
              value={current}
              onChange={edit(setCurrent)}
              autoComplete="current-password"
              disabled={saving}
              icon={Lock}
              className="sm:col-span-2"
            />
          )}
          <Field
            id="new-password"
            label="New password"
            value={next}
            onChange={edit(setNext)}
            autoComplete="new-password"
            placeholder={`Min. ${MIN_LENGTH} characters`}
            disabled={saving}
            icon={KeyRound}
            hint={tooShort ? `Must be at least ${MIN_LENGTH} characters` : undefined}
          />
          <Field
            id="confirm-password"
            label="Confirm new password"
            value={confirm}
            onChange={edit(setConfirm)}
            autoComplete="new-password"
            disabled={saving}
            icon={KeyRound}
            hint={mismatch ? "Passwords do not match" : undefined}
          />
        </div>

        {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        {notice && <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">{notice}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50"
          >
            {saving ? "Saving…" : hasPassword ? "Update password" : "Set password"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
  icon: Icon,
  hint,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  disabled: boolean;
  icon: typeof Lock;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={id}
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          className={inputCls}
        />
      </div>
      {hint && <p className="text-[11px] text-red-400">{hint}</p>}
    </div>
  );
}
