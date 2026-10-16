"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { setDiscordSettings, testDiscordWebhook } from "@/lib/actions/discord-settings";
import {
  DISCORD_EVENTS,
  normalizeDiscordSettings,
  type DiscordEvent,
  type DiscordKind,
  type DiscordSettings,
} from "@/lib/discord-config";

const inputCls =
  "w-full rounded-xl border border-border/70 bg-card py-2 pl-3 pr-10 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";

const CHANNELS: { kind: DiscordKind; key: "deposit_webhook_url" | "withdrawal_webhook_url"; label: string }[] = [
  { kind: "deposit", key: "deposit_webhook_url", label: "Deposits webhook" },
  { kind: "withdrawal", key: "withdrawal_webhook_url", label: "Withdrawals webhook" },
];

const same = (a: DiscordSettings, b: DiscordSettings) => JSON.stringify(a) === JSON.stringify(b);

export function DiscordNotificationsCard({ initial }: { initial: DiscordSettings }) {
  const [values, setValues] = useState<DiscordSettings>(initial);
  const [saved, setSaved] = useState<DiscordSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revealed, setRevealed] = useState<Record<DiscordKind, boolean>>({ deposit: false, withdrawal: false });
  const [testing, setTesting] = useState<DiscordKind | null>(null);
  const [testResult, setTestResult] = useState<Partial<Record<DiscordKind, { ok: boolean; text: string }>>>({});

  const { settings: normalized, errors } = normalizeDiscordSettings(values);
  const dirty = !same(normalized, saved);
  const hasErrors = Object.keys(errors).length > 0;

  const update = (patch: Partial<DiscordSettings>) => {
    setValues((v) => ({ ...v, ...patch }));
    setNotice("");
  };

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty || hasErrors || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = await setDiscordSettings(values);
      setValues(next);
      setSaved(next);
      setNotice(next.enabled ? "Saved — notifications are live." : "Saved — notifications are off.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save Discord settings");
    } finally {
      setSaving(false);
    }
  }

  async function runTest(kind: DiscordKind, url: string) {
    setTesting(kind);
    setTestResult((r) => ({ ...r, [kind]: undefined }));
    try {
      await testDiscordWebhook(kind, url);
      setTestResult((r) => ({ ...r, [kind]: { ok: true, text: "Test message sent — check the channel." } }));
    } catch (err: unknown) {
      setTestResult((r) => ({
        ...r,
        [kind]: { ok: false, text: err instanceof Error ? err.message : "Test failed" },
      }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <section className="rounded-[24px] border border-border/70 bg-card/80 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Notifications</p>
          <h2 className="text-xl font-bold tracking-tight">Discord</h2>
          <p className="text-sm text-muted-foreground">
            Post deposits and withdrawals to Discord channels. In Discord open the channel&apos;s{" "}
            <span className="text-foreground/80">Settings → Integrations → Webhooks</span>, create a
            webhook and paste its URL here. Both fields can use the same URL.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={values.enabled}
          onClick={() => update({ enabled: !values.enabled })}
          disabled={saving}
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-border bg-background/70 px-3 py-2 text-sm font-medium disabled:opacity-60"
        >
          <span
            className={`relative h-5 w-9 rounded-full transition-colors ${values.enabled ? "bg-primary" : "bg-secondary"}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${values.enabled ? "left-[18px]" : "left-0.5"}`}
            />
          </span>
          {values.enabled ? "On" : "Off"}
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          {CHANNELS.map(({ kind, key, label }) => {
            const url = values[key].trim();
            const fieldError = url ? errors[key] : undefined;
            const result = testResult[kind];
            return (
              <div key={kind} className="space-y-3 rounded-2xl border border-border/60 bg-background/40 p-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`discord-${kind}`}
                    className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
                  >
                    {label}
                  </label>
                  <div className="relative">
                    <input
                      id={`discord-${kind}`}
                      type={revealed[kind] ? "text" : "password"}
                      value={values[key]}
                      onChange={(e) => update({ [key]: e.target.value } as Partial<DiscordSettings>)}
                      placeholder="https://discord.com/api/webhooks/…"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={saving}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => setRevealed((r) => ({ ...r, [kind]: !r[kind] }))}
                      aria-label={revealed[kind] ? "Hide URL" : "Show URL"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                    >
                      {revealed[kind] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldError ? (
                    <p className="text-[11px] text-red-400">{fieldError}</p>
                  ) : !url ? (
                    <p className="text-[11px] text-muted-foreground/70">
                      Blank — {kind === "deposit" ? "deposit" : "withdrawal"} events won&apos;t be posted.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {(Object.keys(DISCORD_EVENTS) as DiscordEvent[])
                    .filter((ev) => DISCORD_EVENTS[ev].kind === kind)
                    .map((ev) => (
                      <label key={ev} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={values.events[ev]}
                          onChange={(e) => update({ events: { ...values.events, [ev]: e.target.checked } })}
                          disabled={saving}
                          className="h-4 w-4 rounded border-border/70 accent-primary"
                        />
                        {DISCORD_EVENTS[ev].label}
                      </label>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => runTest(kind, url)}
                    disabled={!url || !!fieldError || testing !== null}
                    className="rounded-lg bg-primary/15 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                  >
                    {testing === kind ? "Sending…" : "Send test"}
                  </button>
                  {result && (
                    <span className={`text-[11px] ${result.ok ? "text-emerald-400" : "text-red-400"}`}>
                      {result.text}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {errors.enabled && <p className="text-[11px] text-red-400">{errors.enabled}</p>}
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
            {saving ? "Saving…" : "Save Discord settings"}
          </button>
        </div>
      </form>
    </section>
  );
}
