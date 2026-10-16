"use server";

import { db } from "@/lib/db";
import { platform_settings, admin_audit_log } from "@/lib/supabase/schema";
import { revalidatePath } from "next/cache";
import { verifyCapability } from "@/lib/auth/permissions";
import { getSetting } from "@/lib/actions/platform-settings";
import { sendDiscordTest } from "@/lib/notifications/discord";
import {
  DISCORD_SETTINGS_KEY,
  DEFAULT_DISCORD_SETTINGS,
  normalizeDiscordSettings,
  readDiscordSettings,
  type DiscordKind,
  type DiscordSettings,
} from "@/lib/discord-config";

/**
 * Webhook URLs are bearer credentials — anyone holding one can post into the
 * channel — so reading them is gated exactly like writing them.
 */
const verifyOwner = () => verifyCapability("manage_discord_notifications");

export async function getDiscordSettings(): Promise<DiscordSettings> {
  await verifyOwner();
  return readDiscordSettings(await getSetting<unknown>(DISCORD_SETTINGS_KEY, DEFAULT_DISCORD_SETTINGS));
}

export async function setDiscordSettings(input: DiscordSettings): Promise<DiscordSettings> {
  const admin = await verifyOwner();

  const { settings, errors } = normalizeDiscordSettings(input);
  const firstError = Object.values(errors)[0];
  if (firstError) throw new Error(firstError);

  await db
    .insert(platform_settings)
    .values({ key: DISCORD_SETTINGS_KEY, value: settings })
    .onConflictDoUpdate({
      target: platform_settings.key,
      set: { value: settings, updated_at: new Date() },
    });

  // The audit trail records what changed, never the webhook secrets themselves.
  await db.insert(admin_audit_log).values({
    admin_id:    admin.id,
    action:      "set_discord_notifications",
    target_type: "platform_setting",
    target_id:   admin.id,
    details: {
      key: DISCORD_SETTINGS_KEY,
      enabled: settings.enabled,
      deposit_webhook: Boolean(settings.deposit_webhook_url),
      withdrawal_webhook: Boolean(settings.withdrawal_webhook_url),
      events: settings.events,
    },
  });

  revalidatePath("/admin/settings");
  return settings;
}

/** Posts a sample message to the given (possibly unsaved) webhook URL. */
export async function testDiscordWebhook(kind: DiscordKind, url: string) {
  const admin = await verifyOwner();
  await sendDiscordTest(url.trim(), kind, admin.username ? `@${admin.username}` : admin.id.slice(0, 8));
}
