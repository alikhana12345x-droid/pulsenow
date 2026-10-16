import { randomInt } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/supabase/schema";

const ADJECTIVES = [
  "Lucky", "Swift", "Bold", "Silent", "Golden", "Wild", "Rapid", "Royal",
  "Cosmic", "Fierce", "Neon", "Turbo", "Ace", "Sharp", "Mighty", "Shadow",
];

const NOUNS = [
  "Falcon", "Tiger", "Comet", "Rider", "Striker", "Panther", "Phoenix", "Wolf",
  "Rocket", "Sniper", "Dragon", "Hawk", "Bandit", "Viper", "Titan", "Jaguar",
];

function pick<T>(list: T[]): T {
  return list[randomInt(list.length)];
}

/** e.g. "SwiftFalcon482" — safe as both a display name and a username seed. */
export function generateRandomDisplayName(): string {
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${randomInt(100, 1000)}`;
}

function toUsername(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

/**
 * Pick a display name + matching username that nobody else holds. `username`
 * is null when every attempt collided — callers should keep the profile's
 * existing handle in that case rather than blocking the user.
 */
export async function generateUniqueRandomIdentity(): Promise<{
  displayName: string;
  username: string | null;
}> {
  for (let i = 0; i < 5; i++) {
    const displayName = generateRandomDisplayName();
    const username    = toUsername(displayName);

    const [taken] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.username, username))
      .limit(1);

    if (!taken) return { displayName, username };
  }

  return { displayName: generateRandomDisplayName(), username: null };
}
