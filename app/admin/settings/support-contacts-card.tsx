"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Phone, Send } from "lucide-react";
import { setSupportContacts } from "@/lib/actions/platform-settings";
import {
  normalizeSupportContacts,
  type SupportChannel,
  type SupportContacts,
} from "@/lib/support-contacts";

const FIELDS: {
  key: SupportChannel;
  label: string;
  placeholder: string;
  icon: typeof Mail;
  inputMode: "email" | "tel" | "text";
}[] = [
  { key: "email", label: "Email", placeholder: "support@pulsenow.xyz", icon: Mail, inputMode: "email" },
  { key: "phone", label: "Phone", placeholder: "+92 300 1234567", icon: Phone, inputMode: "tel" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "+92 300 1234567", icon: MessageCircle, inputMode: "tel" },
  { key: "telegram", label: "Telegram", placeholder: "@PulseNowSupport", icon: Send, inputMode: "text" },
];

const inputCls =
  "w-full rounded-xl border border-border/70 bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";

export function SupportContactsCard({ initial }: { initial: SupportContacts }) {
  const router = useRouter();
  const [values, setValues] = useState<SupportContacts>(initial);
  const [saved, setSaved] = useState<SupportContacts>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const { errors } = normalizeSupportContacts(values);
  const dirty = FIELDS.some(({ key }) => values[key].trim() !== saved[key]);
  const hasErrors = Object.keys(errors).length > 0;
  const liveCount = FIELDS.filter(({ key }) => saved[key]).length;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty || hasErrors || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = await setSupportContacts(values);
      setValues(next);
      setSaved(next);
      setNotice("Saved — the Support page now shows these channels.");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save contacts");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-border/70 bg-card/80 p-6">
      <div className="max-w-xl space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Support</p>
        <h2 className="text-xl font-bold tracking-tight">Contact channels</h2>
        <p className="text-sm text-muted-foreground">
          Shown to players on the Support page. Leave a field blank to hide that channel.{" "}
          {liveCount === 0
            ? "Nothing is filled in yet, so players see no contact options."
            : `${liveCount} channel${liveCount === 1 ? "" : "s"} live.`}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(({ key, label, placeholder, icon: Icon, inputMode }) => (
            <div key={key} className="space-y-1.5">
              <label
                htmlFor={`support-${key}`}
                className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
              >
                {label}
              </label>
              <div className="relative">
                <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id={`support-${key}`}
                  value={values[key]}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [key]: e.target.value }));
                    setNotice("");
                  }}
                  placeholder={placeholder}
                  inputMode={inputMode}
                  autoComplete="off"
                  disabled={saving}
                  className={inputCls}
                />
              </div>
              {values[key].trim() && errors[key] && (
                <p className="text-[11px] text-red-400">{errors[key]}</p>
              )}
            </div>
          ))}
        </div>

        {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        {notice && !dirty && (
          <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">{notice}</p>
        )}

        <div className="flex justify-end gap-2">
          {dirty && (
            <button
              type="button"
              onClick={() => {
                setValues(saved);
                setError("");
              }}
              disabled={saving}
              className="rounded-xl border border-border/70 bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              Discard
            </button>
          )}
          <button
            type="submit"
            disabled={!dirty || hasErrors || saving}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save contacts"}
          </button>
        </div>
      </form>
    </section>
  );
}
