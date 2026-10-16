"use server";

import { db } from "@/lib/db";
import {
  profiles,
  promotions,
  promotion_players,
  admin_audit_log,
} from "@/lib/supabase/schema";
import { eq, desc, count, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { verifyCapability } from "@/lib/auth/permissions";

const verifyAdmin = () => verifyCapability("manage_promotions");

// ─── Promotions ───────────────────────────────────────────────────────────────

export async function getPromotions() {
  return db
    .select()
    .from(promotions)
    .orderBy(desc(promotions.created_at))
    .limit(200);
}

export async function getPromotionStats() {
  const [total, active] = await Promise.all([
    db.select({ count: count() }).from(promotions),
    db.select({ count: count() }).from(promotions).where(eq(promotions.is_active, true)),
  ]);
  return { total: total[0].count, active: active[0].count };
}

export type CreatePromotionInput = {
  title: string;
  description?: string;
  type: string;
  image_url?: string;
  content?: string;
  bg_color?: string;
  show_frequency: string;
  cta_action?: string | null;
  cta_label?: string | null;
};

export async function createPromotion(input: CreatePromotionInput) {
  const admin = await verifyAdmin();

  const [promo] = await db
    .insert(promotions)
    .values({
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      display_location: "lobby",
      game_ids: null,
      image_url: input.image_url ?? null,
      content: input.content ?? null,
      bg_color: input.bg_color ?? "#0d0b1e",
      cta_action: input.cta_action ?? null,
      cta_label: input.cta_label ?? null,
      show_frequency: input.show_frequency,
      is_active: false,
      created_by: admin.id,
    })
    .returning({ id: promotions.id });

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "create_promotion",
    target_type: "promotion",
    target_id: promo.id,
    details: { title: input.title, type: input.type },
  });

  revalidatePath("/admin/promotions");
}

export type UpdatePromotionInput = CreatePromotionInput & { id: string };

export async function updatePromotion(input: UpdatePromotionInput) {
  const admin = await verifyAdmin();

  await db
    .update(promotions)
    .set({
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      display_location: "lobby",
      game_ids: null,
      image_url: input.image_url ?? null,
      content: input.content ?? null,
      bg_color: input.bg_color ?? "#0d0b1e",
      cta_action: input.cta_action ?? null,
      cta_label: input.cta_label ?? null,
      show_frequency: input.show_frequency,
      updated_at: new Date(),
    })
    .where(eq(promotions.id, input.id));

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "update_promotion",
    target_type: "promotion",
    target_id: input.id,
    details: { title: input.title },
  });

  revalidatePath("/admin/promotions");
}

export async function togglePromotion(id: string, is_active: boolean) {
  const admin = await verifyAdmin();

  await db
    .update(promotions)
    .set({ is_active, updated_at: new Date() })
    .where(eq(promotions.id, id));

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: is_active ? "enable_promotion" : "disable_promotion",
    target_type: "promotion",
    target_id: id,
    details: {},
  });

  revalidatePath("/admin/promotions");
}

export async function deletePromotion(id: string) {
  const admin = await verifyAdmin();

  await db.delete(promotions).where(eq(promotions.id, id));

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "delete_promotion",
    target_type: "promotion",
    target_id: id,
    details: {},
  });

  revalidatePath("/admin/promotions");
}

// ─── Promotion Players ────────────────────────────────────────────────────────

export async function getPromotionPlayers() {
  return db
    .select({
      id: promotion_players.id,
      user_id: promotion_players.user_id,
      username: profiles.username,
      display_name: profiles.display_name,
      notes: promotion_players.notes,
      win_probability_boost: promotion_players.win_probability_boost,
      is_active: promotion_players.is_active,
      created_at: promotion_players.created_at,
    })
    .from(promotion_players)
    .leftJoin(profiles, eq(profiles.id, promotion_players.user_id))
    .orderBy(desc(promotion_players.created_at))
    .limit(200);
}

export async function getPromotionPlayerStats() {
  const [total, active] = await Promise.all([
    db.select({ count: count() }).from(promotion_players),
    db.select({ count: count() }).from(promotion_players).where(eq(promotion_players.is_active, true)),
  ]);
  return { total: total[0].count, active: active[0].count };
}

export async function addPromotionPlayer(
  userId: string,
  winBoost: number,
  notes: string
) {
  const admin = await verifyAdmin();

  const existing = await db
    .select({ id: promotion_players.id })
    .from(promotion_players)
    .where(eq(promotion_players.user_id, userId))
    .limit(1);

  if (existing.length > 0) throw new Error("Player already in promotion list");

  const [row] = await db
    .insert(promotion_players)
    .values({
      user_id: userId,
      added_by: admin.id,
      notes: notes || null,
      win_probability_boost: String(winBoost),
      is_active: true,
    })
    .returning({ id: promotion_players.id });

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "add_promotion_player",
    target_type: "promotion_player",
    target_id: row.id,
    details: { user_id: userId, win_boost: winBoost },
  });

  revalidatePath("/admin/promotions");
}

export async function updatePromotionPlayer(
  id: string,
  winBoost: number,
  notes: string
) {
  const admin = await verifyAdmin();

  await db
    .update(promotion_players)
    .set({
      win_probability_boost: String(winBoost),
      notes: notes || null,
      updated_at: new Date(),
    })
    .where(eq(promotion_players.id, id));

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "update_promotion_player",
    target_type: "promotion_player",
    target_id: id,
    details: { win_boost: winBoost },
  });

  revalidatePath("/admin/promotions");
}

export async function togglePromotionPlayer(id: string, is_active: boolean) {
  const admin = await verifyAdmin();

  await db
    .update(promotion_players)
    .set({ is_active, updated_at: new Date() })
    .where(eq(promotion_players.id, id));

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: is_active ? "enable_promotion_player" : "disable_promotion_player",
    target_type: "promotion_player",
    target_id: id,
    details: {},
  });

  revalidatePath("/admin/promotions");
}

export async function removePromotionPlayer(id: string) {
  const admin = await verifyAdmin();

  await db.delete(promotion_players).where(eq(promotion_players.id, id));

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "remove_promotion_player",
    target_type: "promotion_player",
    target_id: id,
    details: {},
  });

  revalidatePath("/admin/promotions");
}

export async function getActiveLobbyPromotions() {
  return db
    .select()
    .from(promotions)
    .where(and(eq(promotions.is_active, true), eq(promotions.display_location, "lobby")))
    .orderBy(desc(promotions.created_at))
    .limit(10);
}

export async function findUserByUsername(username: string) {
  const [user] = await db
    .select({ id: profiles.id, username: profiles.username, display_name: profiles.display_name })
    .from(profiles)
    .where(eq(profiles.username, username))
    .limit(1);
  return user ?? null;
}
