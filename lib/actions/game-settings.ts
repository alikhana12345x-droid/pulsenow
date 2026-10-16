"use server";

import { db } from "@/lib/db";
import { bet_amount_tiers, admin_audit_log } from "@/lib/supabase/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { invalidateTiersCache } from "@/lib/player-win-probability";
import { verifyCapability } from "@/lib/auth/permissions";

// Bet tiers carry the win probabilities that decide what the house pays out —
// owner-level control, not day-to-day admin work.
const verifyAdmin = () => verifyCapability("manage_platform_settings");

export async function getTiers() {
  return db
    .select()
    .from(bet_amount_tiers)
    .orderBy(asc(bet_amount_tiers.sort_order));
}

export type TierInput = {
  id?: string;
  label: string;
  min_amount: number;
  max_amount: number;
  win_probability: number;
  sort_order: number;
};

export async function upsertTier(input: TierInput) {
  const admin = await verifyAdmin();

  if (input.id) {
    await db
      .update(bet_amount_tiers)
      .set({
        label:           input.label,
        min_amount:      String(input.min_amount),
        max_amount:      String(input.max_amount),
        win_probability: input.win_probability,
        sort_order:      input.sort_order,
        updated_at:      new Date(),
      })
      .where(eq(bet_amount_tiers.id, input.id));

    await db.insert(admin_audit_log).values({
      admin_id:    admin.id,
      action:      "update_tier",
      target_type: "bet_amount_tier",
      target_id:   input.id,
      details:     { label: input.label, win_probability: input.win_probability },
    });
  } else {
    const [created] = await db
      .insert(bet_amount_tiers)
      .values({
        label:           input.label,
        min_amount:      String(input.min_amount),
        max_amount:      String(input.max_amount),
        win_probability: input.win_probability,
        sort_order:      input.sort_order,
      })
      .returning({ id: bet_amount_tiers.id });

    await db.insert(admin_audit_log).values({
      admin_id:    admin.id,
      action:      "create_tier",
      target_type: "bet_amount_tier",
      target_id:   created.id,
      details:     { label: input.label, win_probability: input.win_probability },
    });
  }

  invalidateTiersCache();
  revalidatePath("/admin/settings");
}

export async function deleteTier(id: string) {
  const admin = await verifyAdmin();

  const [tier] = await db
    .select()
    .from(bet_amount_tiers)
    .where(eq(bet_amount_tiers.id, id))
    .limit(1);
  if (!tier) throw new Error("Tier not found");

  await db.delete(bet_amount_tiers).where(eq(bet_amount_tiers.id, id));

  await db.insert(admin_audit_log).values({
    admin_id:    admin.id,
    action:      "delete_tier",
    target_type: "bet_amount_tier",
    target_id:   id,
    details:     { label: tier.label },
  });

  invalidateTiersCache();
  revalidatePath("/admin/settings");
}

export async function toggleTier(id: string, isActive: boolean) {
  const admin = await verifyAdmin();

  await db
    .update(bet_amount_tiers)
    .set({ is_active: isActive, updated_at: new Date() })
    .where(eq(bet_amount_tiers.id, id));

  await db.insert(admin_audit_log).values({
    admin_id:    admin.id,
    action:      "toggle_tier",
    target_type: "bet_amount_tier",
    target_id:   id,
    details:     { is_active: isActive },
  });

  invalidateTiersCache();
  revalidatePath("/admin/settings");
}
