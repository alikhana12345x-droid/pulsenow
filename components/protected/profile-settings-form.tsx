"use client";

import { useState, useTransition } from "react";
import { updateProfileDetails } from "@/lib/actions/profile";

type ProfileSettingsFormProps = {
  initialValues: {
    username: string;
    displayName: string;
    phone: string;
    avatarUrl: string;
  };
};

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-border bg-background/80 px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </label>
  );
}

export function ProfileSettingsForm({ initialValues }: ProfileSettingsFormProps) {
  const [username, setUsername] = useState(initialValues.username);
  const [displayName, setDisplayName] = useState(initialValues.displayName);
  const [phone, setPhone] = useState(initialValues.phone);
  const [avatarUrl, setAvatarUrl] = useState(initialValues.avatarUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        await updateProfileDetails({ username, displayName, phone, avatarUrl });
        setMessage("Profile updated successfully.");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unable to update profile.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="rounded-[28px] border border-border/70 bg-card/80 p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Profile Settings</p>
        <h2 className="mt-2 text-xl font-bold">Personal details</h2>
        <p className="mt-1 text-sm text-muted-foreground">Keep your account details clean so support, security, and referrals work smoothly.</p>
      </div>

      <div className="grid gap-4">
        <InputField label="Username" value={username} onChange={setUsername} placeholder="your_username" hint="Used across your profile and referrals." />
        <InputField label="Display Name" value={displayName} onChange={setDisplayName} placeholder="How your name should appear" />
        <InputField label="Phone" value={phone} onChange={setPhone} placeholder="+92 300 1234567" type="tel" />
        <InputField label="Avatar URL" value={avatarUrl} onChange={setAvatarUrl} placeholder="https://example.com/avatar.png" hint="Optional. Use a direct image link." />
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {message && <p className="mt-4 text-sm text-green-400">{message}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
