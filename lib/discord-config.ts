/**
 * Discord notification settings — which channel webhooks get deposit and
 * withdrawal events, and which events are sent. Stored in platform_settings.
 *
 * Client-safe (no server imports) so the admin form and the server validate
 * with the same rules.
 */

export const DISCORD_SETTINGS_KEY = "discord_notifications";

export const DISCORD_EVENTS = {
  deposit_requested:    { kind: "deposit",    label: "New deposit request" },
  deposit_confirmed:    { kind: "deposit",    label: "Deposit confirmed" },
  deposit_failed:       { kind: "deposit",    label: "Deposit failed / cancelled" },
  withdrawal_requested: { kind: "withdrawal", label: "New withdrawal request" },
  withdrawal_completed: { kind: "withdrawal", label: "Withdrawal completed" },
  withdrawal_failed:    { kind: "withdrawal", label: "Withdrawal failed / rejected" },
} as const;

export type DiscordEvent = keyof typeof DISCORD_EVENTS;
export type DiscordKind = "deposit" | "withdrawal";

export type DiscordSettings = {
  enabled: boolean;
  deposit_webhook_url: string;
  withdrawal_webhook_url: string;
  events: Record<DiscordEvent, boolean>;
};

const ALL_EVENTS = Object.keys(DISCORD_EVENTS) as DiscordEvent[];

export const DEFAULT_DISCORD_SETTINGS: DiscordSettings = {
  enabled: false,
  deposit_webhook_url: "",
  withdrawal_webhook_url: "",
  events: Object.fromEntries(ALL_EVENTS.map((e) => [e, true])) as Record<DiscordEvent, boolean>,
};

/**
 * Only real Discord webhook URLs are accepted. Besides catching typos, this
 * stops the setting from being used to make the server POST to arbitrary hosts.
 */
const WEBHOOK_PATTERN =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}\/?$/;

export function isDiscordWebhookUrl(value: string) {
  return WEBHOOK_PATTERN.test(value.trim());
}

/** Tolerant read of a stored value — missing keys fall back to the defaults. */
export function readDiscordSettings(value: unknown): DiscordSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const events = (v.events && typeof v.events === "object" ? v.events : {}) as Record<string, unknown>;
  return {
    enabled: v.enabled === true,
    deposit_webhook_url: typeof v.deposit_webhook_url === "string" ? v.deposit_webhook_url : "",
    withdrawal_webhook_url: typeof v.withdrawal_webhook_url === "string" ? v.withdrawal_webhook_url : "",
    events: Object.fromEntries(
      ALL_EVENTS.map((e) => [e, typeof events[e] === "boolean" ? events[e] : true])
    ) as Record<DiscordEvent, boolean>,
  };
}

/** Trim, validate and normalise admin input. Blank webhooks are valid (that kind is off). */
export function normalizeDiscordSettings(input: DiscordSettings): {
  settings: DiscordSettings;
  errors: Partial<Record<"deposit_webhook_url" | "withdrawal_webhook_url" | "enabled", string>>;
} {
  const settings = readDiscordSettings(input);
  settings.deposit_webhook_url = settings.deposit_webhook_url.trim();
  settings.withdrawal_webhook_url = settings.withdrawal_webhook_url.trim();

  const errors: ReturnType<typeof normalizeDiscordSettings>["errors"] = {};
  for (const key of ["deposit_webhook_url", "withdrawal_webhook_url"] as const) {
    if (settings[key] && !isDiscordWebhookUrl(settings[key])) {
      errors[key] = "Paste the webhook URL from Discord: Channel settings → Integrations → Webhooks → Copy URL";
    }
  }
  if (settings.enabled && !settings.deposit_webhook_url && !settings.withdrawal_webhook_url) {
    errors.enabled = "Add at least one webhook URL before turning notifications on";
  }
  return { settings, errors };
}
