"use server";

import { db } from "@/lib/db";
import { games, admin_audit_log } from "@/lib/supabase/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { invalidateGamesCache } from "@/lib/games-registry";
import { coerceGameStatus, type GameStatus } from "@/lib/games-catalogue";
import { verifyCapability } from "@/lib/auth/permissions";

const verifyAdmin = () => verifyCapability("manage_games");

// Propagate a change to both the admin view and the public lobby.
function revalidateAll() {
  invalidateGamesCache();
  revalidatePath("/admin/games");
  revalidatePath("/");
}

export async function getAdminGames() {
  return db.select().from(games).orderBy(asc(games.sort_order));
}

export type GameAdminInput = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  gradient: string;
  glow: string | null;
  payout_label: string | null;
  badge: string | null;
  sort_order: number;
  status: GameStatus;
  featured: boolean;
  card_image_url: string | null;
  loading_image_url: string | null;
  banner_image_url: string | null;
};

const STATUSES: GameStatus[] = ["live", "coming_soon", "maintenance", "hidden"];

// Any number of games may be "featured" (each renders as a big hero card in the
// lobby, stacked in sort_order) — no exclusivity enforced here.

export async function updateGame(input: GameAdminInput) {
  const admin = await verifyAdmin();
  if (!STATUSES.includes(input.status)) throw new Error("Invalid status");

  const [existing] = await db.select({ id: games.id, slug: games.slug }).from(games).where(eq(games.id, input.id)).limit(1);
  if (!existing) throw new Error("Game not found");

  await db
    .update(games)
    .set({
      title: input.title,
      subtitle: input.subtitle,
      emoji: input.emoji,
      gradient: input.gradient,
      glow: input.glow || null,
      payout_label: input.payout_label || null,
      badge: input.badge || null,
      sort_order: input.sort_order,
      status: input.status,
      featured: input.featured,
      card_image_url: input.card_image_url || null,
      loading_image_url: input.loading_image_url || null,
      banner_image_url: input.banner_image_url || null,
      updated_at: new Date(),
    })
    .where(eq(games.id, input.id));

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "update_game",
    target_type: "game",
    target_id: input.id,
    details: { slug: existing.slug, status: input.status, featured: input.featured, sort_order: input.sort_order },
  });

  revalidateAll();
}

export async function setGameStatus(id: string, status: string) {
  const admin = await verifyAdmin();
  const next = coerceGameStatus(status);

  const [game] = await db.select({ id: games.id, slug: games.slug }).from(games).where(eq(games.id, id)).limit(1);
  if (!game) throw new Error("Game not found");

  await db.update(games).set({ status: next, updated_at: new Date() }).where(eq(games.id, id));

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "set_game_status",
    target_type: "game",
    target_id: id,
    details: { slug: game.slug, status: next },
  });

  revalidateAll();
}

export async function setGameFeatured(id: string, featured: boolean) {
  const admin = await verifyAdmin();

  const [game] = await db.select({ id: games.id, slug: games.slug }).from(games).where(eq(games.id, id)).limit(1);
  if (!game) throw new Error("Game not found");

  await db.update(games).set({ featured, updated_at: new Date() }).where(eq(games.id, id));

  await db.insert(admin_audit_log).values({
    admin_id: admin.id,
    action: "set_game_featured",
    target_type: "game",
    target_id: id,
    details: { slug: game.slug, featured },
  });

  revalidateAll();
}
