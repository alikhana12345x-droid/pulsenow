"use server";

import { db } from "@/lib/db";
import { platform_settings, admin_audit_log } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { verifyCapability } from "@/lib/auth/permissions";
import {
  SUPPORT_CONTACTS_KEY,
  EMPTY_SUPPORT_CONTACTS,
  normalizeSupportContacts,
  readSupportContacts,
  type SupportContacts,
} from "@/lib/support-contacts";

export type PaymentMode = "manual" | "auto";

const PAYMENT_MODE_KEY = "payment_mode";

const verifyAdmin = () => verifyCapability("manage_platform_settings");

/** Read a platform setting, returning `fallback` when the key is unset. Not admin-gated. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const [row] = await db
      .select({ value: platform_settings.value })
      .from(platform_settings)
      .where(eq(platform_settings.key, key))
      .limit(1);
    return row ? (row.value as T) : fallback;
  } catch {
    // Table missing (migration not yet applied) or transient error — fall back safely.
    return fallback;
  }
}

async function setSetting(key: string, value: unknown) {
  await db
    .insert(platform_settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: platform_settings.key,
      set: { value, updated_at: new Date() },
    });
}

/** Current payment mode. Defaults to "manual" (no live merchant gateways yet). Not admin-gated. */
export async function getPaymentMode(): Promise<PaymentMode> {
  const mode = await getSetting<PaymentMode>(PAYMENT_MODE_KEY, "manual");
  return mode === "auto" ? "auto" : "manual";
}

export async function setPaymentMode(mode: PaymentMode) {
  const admin = await verifyAdmin();
  const next: PaymentMode = mode === "auto" ? "auto" : "manual";

  await setSetting(PAYMENT_MODE_KEY, next);

  await db.insert(admin_audit_log).values({
    admin_id:    admin.id,
    action:      "set_payment_mode",
    target_type: "platform_setting",
    target_id:   admin.id,
    details:     { key: PAYMENT_MODE_KEY, value: next },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/protected", "layout");
}

/** Support channels shown to players. All blank until an admin fills them in. Not admin-gated. */
export async function getSupportContacts(): Promise<SupportContacts> {
  return readSupportContacts(await getSetting<unknown>(SUPPORT_CONTACTS_KEY, EMPTY_SUPPORT_CONTACTS));
}

export async function setSupportContacts(input: Partial<SupportContacts>) {
  const admin = await verifyCapability("manage_support_contacts");

  const { contacts, errors } = normalizeSupportContacts(input);
  const firstError = Object.values(errors)[0];
  if (firstError) throw new Error(firstError);

  await setSetting(SUPPORT_CONTACTS_KEY, contacts);

  await db.insert(admin_audit_log).values({
    admin_id:    admin.id,
    action:      "set_support_contacts",
    target_type: "platform_setting",
    target_id:   admin.id,
    details:     { key: SUPPORT_CONTACTS_KEY, value: contacts },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/protected/support");
  return contacts;
}
