/**
 * Server-side enforcement of the role model in `./roles`.
 *
 * Two ways in, and the difference matters:
 *
 *   • `verify*` — resolves the actor from the **session cookie**. Use for every
 *     mutation and every sensitive read. Nothing a client sends can influence it.
 *   • `require*Page` — resolves the actor from the `x-user-sub` header the proxy
 *     stamps after it has already validated the token, which saves a refresh
 *     round-trip on page renders. The *role* is still loaded from the database,
 *     never taken from a header.
 *
 * Server actions are POST endpoints the browser can call directly, so hiding a
 * button is not access control — the matching `verify*` call is.
 */

import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { profiles } from "@/lib/supabase/schema";
import { createClient } from "@/lib/supabase/server";
import { can, isAdminRole, isSuperadmin, type Capability, type Role } from "./roles";

export type Actor = { id: string; role: Role; username: string | null };

const loadActor = cache(async (userId: string): Promise<Actor | null> => {
  const [profile] = await db
    .select({ id: profiles.id, role: profiles.role, username: profiles.username })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  return profile
    ? { id: profile.id, role: profile.role as Role, username: profile.username }
    : null;
});

/** The signed-in actor per the session cookie. The trustworthy path. */
export const getSessionActor = cache(async (): Promise<Actor | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  return userId ? loadActor(userId) : null;
});

/** The actor for a page render — proxy-supplied id, database-resolved role. */
export const getViewerActor = cache(async (): Promise<Actor | null> => {
  const userId = (await headers()).get("x-user-sub");
  return userId ? loadActor(userId) : getSessionActor();
});

// ── Action guards (throw) ────────────────────────────────────────────────────

export async function verifyAdmin(): Promise<Actor> {
  const actor = await getSessionActor();
  if (!actor) throw new Error("Unauthorized");
  if (!isAdminRole(actor.role)) throw new Error("Forbidden");
  return actor;
}

export async function verifySuperadmin(): Promise<Actor> {
  const actor = await verifyAdmin();
  if (!isSuperadmin(actor.role)) throw new Error("Forbidden: superadmin only");
  return actor;
}

export async function verifyCapability(capability: Capability): Promise<Actor> {
  const actor = await verifyAdmin();
  if (!can(actor.role, capability)) {
    throw new Error(`Forbidden: "${capability}" requires a superadmin`);
  }
  return actor;
}

// ── Page guards (redirect) ───────────────────────────────────────────────────

export async function requireAdminPage(): Promise<Actor> {
  const actor = await getViewerActor();
  if (!actor || !isAdminRole(actor.role)) redirect("/");
  return actor;
}

/**
 * Gate a whole admin page. An admin who lands on a superadmin-only URL is sent
 * back to the dashboard with `?denied=` so the bounce is explained rather than
 * looking like a broken link.
 */
export async function requireCapabilityPage(capability: Capability): Promise<Actor> {
  const actor = await requireAdminPage();
  if (!can(actor.role, capability)) redirect(`/admin?denied=${capability}`);
  return actor;
}
