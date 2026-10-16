import { after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deposits, withdrawals, profiles, payment_accounts } from "@/lib/supabase/schema";
import { getSetting } from "@/lib/actions/platform-settings";
import {
  DISCORD_EVENTS,
  DISCORD_SETTINGS_KEY,
  DEFAULT_DISCORD_SETTINGS,
  isDiscordWebhookUrl,
  readDiscordSettings,
  type DiscordEvent,
  type DiscordKind,
  type DiscordSettings,
} from "@/lib/discord-config";

/**
 * Posts deposit / withdrawal events to the Discord channels configured under
 * Admin → Settings.
 *
 * Notifications are best-effort by design: they run after the response via
 * `after()` and never throw, so a Discord outage or a bad webhook can never
 * fail, slow down or roll back a deposit or payout.
 */

const COLORS = { requested: 0xf29a0b, success: 0x22c55e, failure: 0xef4444 };

const EVENT_STYLE: Record<DiscordEvent, { title: string; color: number }> = {
  deposit_requested:    { title: "📥 New deposit request",   color: COLORS.requested },
  deposit_confirmed:    { title: "✅ Deposit confirmed",      color: COLORS.success },
  deposit_failed:       { title: "❌ Deposit failed",         color: COLORS.failure },
  withdrawal_requested: { title: "📤 New withdrawal request", color: COLORS.requested },
  withdrawal_completed: { title: "✅ Withdrawal completed",   color: COLORS.success },
  withdrawal_failed:    { title: "❌ Withdrawal failed",      color: COLORS.failure },
};

type Field = { name: string; value: string; inline?: boolean };
type Embed = {
  title: string;
  color: number;
  url?: string;
  fields: Field[];
  image?: { url: string };
  footer?: { text: string };
  timestamp: string;
};
type Attachment = { name: string; blob: Blob };
type Message = { embed: Embed; file?: Attachment | null };

/** Thrown when Discord answered with an error, so we know the message did not land. */
class DiscordRejected extends Error {}

export type NotifyExtra = {
  /** Why it failed / was rejected, when the row doesn't already say. */
  reason?: string | null;
  /** Who acted, for admin-driven transitions ("Approved by …"). */
  actor?: string | null;
};

async function loadSettings(): Promise<DiscordSettings> {
  return readDiscordSettings(await getSetting<unknown>(DISCORD_SETTINGS_KEY, DEFAULT_DISCORD_SETTINGS));
}

function webhookFor(settings: DiscordSettings, kind: DiscordKind) {
  const url = kind === "deposit" ? settings.deposit_webhook_url : settings.withdrawal_webhook_url;
  return url && isDiscordWebhookUrl(url) ? url : null;
}

function adminFinanceUrl() {
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  return base ? `${base}/admin/finance` : undefined;
}

function money(amount: string | number, currency: string) {
  return `${currency} ${Number(amount).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

/** Show enough of an account number to recognise it, not enough to reuse it. */
function maskAccount(value: string) {
  const v = value.trim();
  if (v.length <= 7) return v.replace(/.(?=.{3})/g, "•");
  return `${v.slice(0, 4)}${"•".repeat(Math.min(v.length - 7, 6))}${v.slice(-3)}`;
}

function playerLabel(p: { id: string; username: string | null; display_name: string | null }) {
  const name = p.display_name || p.username || "Unknown";
  const handle = p.username && p.username !== name ? ` (@${p.username})` : "";
  return `${name}${handle}\n\`${p.id.slice(0, 8)}\``;
}

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Discord rejects field values over 1024 chars and blank ones outright. */
function field(name: string, value: string | null | undefined, inline = true): Field[] {
  const v = (value ?? "").trim();
  return v ? [{ name, value: v.slice(0, 1000), inline }] : [];
}

/** Image types Discord renders inside an embed. */
const EMBEDDABLE = new Set(["png", "jpeg", "jpg", "gif", "webp"]);

/** A deposit screenshot ("data:image/jpeg;base64,…") as a file Discord can show inline. */
function proofAttachment(dataUrl: string | null): Attachment | null {
  const comma = dataUrl?.indexOf(",") ?? -1;
  if (!dataUrl || comma < 0) return null;
  const type = /^data:image\/([a-z0-9.+-]+);base64$/i.exec(dataUrl.slice(0, comma))?.[1]?.toLowerCase();
  if (!type || !EMBEDDABLE.has(type)) return null;
  const bytes = Buffer.from(dataUrl.slice(comma + 1), "base64");
  if (!bytes.length) return null;
  return {
    name: `proof.${type === "jpeg" ? "jpg" : type}`,
    blob: new Blob([bytes], { type: `image/${type}` }),
  };
}

async function post(url: string, embed: Embed, file?: Attachment | null) {
  const payload = {
    username: "PulseNow",
    embeds: [embed],
    // Player-controlled text (names, reasons) must never ping @everyone.
    allowed_mentions: { parse: [] },
  };

  let body: string | FormData = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (file) {
    // A file has to go up as multipart; the embed shows it via attachment://name.
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ ...payload, attachments: [{ id: 0, filename: file.name }] }));
    form.append("files[0]", file.blob, file.name);
    body = form;
    delete headers["Content-Type"]; // fetch sets the multipart boundary itself
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(file ? 15000 : 5000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DiscordRejected(`Discord responded ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
}

/**
 * Posts with the attachment, falling back to text only if Discord refuses the
 * file — a bad screenshot must never cost the admin the deposit alert itself.
 * Timeouts are not retried: the first post may have landed, and a duplicate
 * "new deposit" alert reads like a second deposit.
 */
async function send(url: string, { embed, file }: Message) {
  if (!file) return post(url, embed);
  try {
    await post(url, { ...embed, image: { url: `attachment://${file.name}` } }, file);
  } catch (err) {
    if (!(err instanceof DiscordRejected)) throw err;
    console.warn("[discord] proof attachment refused, sending without it:", err.message);
    await post(url, {
      ...embed,
      fields: [...embed.fields, ...field("Proof", "Screenshot couldn't be attached — view it under Admin → Finance.", false)],
    });
  }
}

/** Run after the response when inside a request; otherwise just detach. */
function inBackground(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    void task();
  }
}

// ── Builders ─────────────────────────────────────────────────────────────────

async function depositMessage(depositId: string, event: DiscordEvent, extra: NotifyExtra): Promise<Message | null> {
  // The screenshot rides along on the request alert only — that's where the
  // admin checks it before approving. Later alerts skip the base64 read.
  const withProof = event === "deposit_requested";

  const [row] = await db
    .select({
      id: deposits.id,
      amount: deposits.amount,
      currency: deposits.currency,
      status: deposits.status,
      gateway_ref: deposits.gateway_ref,
      metadata: deposits.metadata,
      proof_url: withProof ? deposits.proof_url : sql<string | null>`null`,
      created_at: deposits.created_at,
      user_id: profiles.id,
      username: profiles.username,
      display_name: profiles.display_name,
      gateway: payment_accounts.gateway,
      account_label: payment_accounts.label,
    })
    .from(deposits)
    .innerJoin(profiles, eq(profiles.id, deposits.user_id))
    .leftJoin(payment_accounts, eq(payment_accounts.id, deposits.payment_account_id))
    .where(eq(deposits.id, depositId))
    .limit(1);
  if (!row) return null;

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const method = typeof meta.gateway === "string" ? meta.gateway : row.gateway;
  const reason = extra.reason ?? (typeof meta.failure_reason === "string" ? meta.failure_reason : null);
  const style = EVENT_STYLE[event];

  return {
    embed: {
      title: style.title,
      color: style.color,
      url: adminFinanceUrl(),
      fields: [
        ...field("Player", playerLabel({ id: row.user_id, username: row.username, display_name: row.display_name })),
        ...field("Amount", `**${money(row.amount, row.currency)}**`),
        ...field("Method", [method && titleCase(method), row.account_label && `→ ${row.account_label}`].filter(Boolean).join(" ")),
        ...field("Type", meta.manual ? "Manual (screenshot — needs approval)" : "Gateway"),
        ...field("Status", titleCase(row.status)),
        ...field("Sender TID", typeof meta.sender_ref === "string" ? meta.sender_ref : null),
        ...field("Reference", row.gateway_ref),
        ...field("Reason", reason, false),
        ...field("By", extra.actor),
      ],
      footer: { text: `Deposit ${row.id.slice(0, 8)}` },
      timestamp: new Date().toISOString(),
    },
    file: proofAttachment(row.proof_url),
  };
}

async function withdrawalMessage(withdrawalId: string, event: DiscordEvent, extra: NotifyExtra): Promise<Message | null> {
  const [row] = await db
    .select({
      id: withdrawals.id,
      amount: withdrawals.amount,
      currency: withdrawals.currency,
      method: withdrawals.method,
      destination: withdrawals.destination,
      status: withdrawals.status,
      rejection_reason: withdrawals.rejection_reason,
      gateway_ref: withdrawals.gateway_ref,
      metadata: withdrawals.metadata,
      user_id: profiles.id,
      username: profiles.username,
      display_name: profiles.display_name,
    })
    .from(withdrawals)
    .innerJoin(profiles, eq(profiles.id, withdrawals.user_id))
    .where(eq(withdrawals.id, withdrawalId))
    .limit(1);
  if (!row) return null;

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const style = EVENT_STYLE[event];

  return {
    embed: {
      title: style.title,
      color: style.color,
      url: adminFinanceUrl(),
      fields: [
        ...field("Player", playerLabel({ id: row.user_id, username: row.username, display_name: row.display_name })),
        ...field("Amount", `**${money(row.amount, row.currency)}**`),
        ...field("Method", titleCase(row.method)),
        ...field("Account", maskAccount(row.destination)),
        ...field("Account name", typeof meta.acct_name === "string" ? meta.acct_name : null),
        ...field("Status", titleCase(row.status)),
        ...field("Reference", row.gateway_ref),
        ...field("Reason", extra.reason ?? row.rejection_reason, false),
        ...field("By", extra.actor),
      ],
      footer: { text: `Withdrawal ${row.id.slice(0, 8)}` },
      timestamp: new Date().toISOString(),
    },
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

function notify(
  kind: DiscordKind,
  id: string,
  event: DiscordEvent,
  extra: NotifyExtra,
  build: (id: string, event: DiscordEvent, extra: NotifyExtra) => Promise<Message | null>
) {
  inBackground(async () => {
    try {
      const settings = await loadSettings();
      if (!settings.enabled || !settings.events[event]) return;
      const url = webhookFor(settings, kind);
      if (!url) return;
      const message = await build(id, event, extra);
      if (message) await send(url, message);
    } catch (err) {
      console.warn(`[discord] ${event} for ${id} not sent:`, err instanceof Error ? err.message : err);
    }
  });
}

export function notifyDeposit(
  depositId: string,
  event: "deposit_requested" | "deposit_confirmed" | "deposit_failed",
  extra: NotifyExtra = {}
) {
  notify("deposit", depositId, event, extra, depositMessage);
}

export function notifyWithdrawal(
  withdrawalId: string,
  event: "withdrawal_requested" | "withdrawal_completed" | "withdrawal_failed",
  extra: NotifyExtra = {}
) {
  notify("withdrawal", withdrawalId, event, extra, withdrawalMessage);
}

/** Sends a sample message straight away so an admin can check a webhook. Throws on failure. */
export async function sendDiscordTest(url: string, kind: DiscordKind, sentBy: string) {
  if (!isDiscordWebhookUrl(url)) throw new Error("That isn't a Discord webhook URL");
  const enabledFor = Object.entries(DISCORD_EVENTS)
    .filter(([, e]) => e.kind === kind)
    .map(([, e]) => e.label)
    .join(", ");
  await post(url, {
    title: "🔔 PulseNow test notification",
    color: COLORS.requested,
    url: adminFinanceUrl(),
    fields: [
      ...field("Channel", kind === "deposit" ? "Deposits" : "Withdrawals"),
      ...field("Sent by", sentBy),
      ...field("Events this channel can receive", enabledFor, false),
    ],
    footer: { text: "If you can read this, the webhook works." },
    timestamp: new Date().toISOString(),
  });
}
